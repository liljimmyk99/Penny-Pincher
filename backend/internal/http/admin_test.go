package http

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"filippo.io/age"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
	"github.com/liljimmyk99/penny-pincher/backend/internal/backup"
)

type memBucket struct {
	mu      sync.Mutex
	objs    map[string][]byte
	release chan struct{} // when set, Put blocks until it is closed
}

func (m *memBucket) Put(_ context.Context, key string, r io.Reader, _ int64) error {
	if m.release != nil {
		<-m.release
	}
	b, err := io.ReadAll(r)
	m.mu.Lock()
	m.objs[key] = b
	m.mu.Unlock()
	return err
}
func (m *memBucket) List(_ context.Context, prefix string) ([]backup.Object, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []backup.Object
	for k, v := range m.objs {
		if strings.HasPrefix(k, prefix) {
			out = append(out, backup.Object{Key: k, Size: int64(len(v))})
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Key < out[j].Key })
	return out, nil
}
func (m *memBucket) Get(_ context.Context, key string) (io.ReadCloser, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return io.NopCloser(strings.NewReader(string(m.objs[key]))), nil
}
func (m *memBucket) Delete(_ context.Context, key string) error {
	m.mu.Lock()
	delete(m.objs, key)
	m.mu.Unlock()
	return nil
}

type backupAPI struct {
	*testAPI
	bucket *memBucket
	id     *age.X25519Identity
}

func newBackupAPI(t *testing.T, release chan struct{}) *backupAPI {
	t.Helper()
	id, err := age.GenerateX25519Identity()
	if err != nil {
		t.Fatal(err)
	}
	b := &memBucket{objs: map[string][]byte{}, release: release}
	a := newTestAPIWith(t, func(db *sql.DB, d *Deps) {
		d.Backups = &backup.Service{DB: db, Bucket: b, Recipient: id.Recipient(), TempDir: t.TempDir()}
	})
	return &backupAPI{testAPI: a, bucket: b, id: id}
}

var adminRoutes = []struct{ method, path string }{
	{"GET", "/v1/admin/status"},
	{"GET", "/v1/admin/backups"},
	{"POST", "/v1/admin/backups"},
	{"GET", "/v1/admin/backups/abc/download"},
	{"GET", "/v1/admin/users"},
	{"POST", "/v1/admin/users"},
}

func TestAdminRoutesRejectMembersAndStrangers(t *testing.T) {
	a := newBackupAPI(t, nil)
	for _, r := range adminRoutes {
		wantError(t, a.call(r.method, r.path, tokMember, ""), 403, api.ErrorErrorCodeAdminRequired)
		wantError(t, a.call(r.method, r.path, tokStray, ""), 403, api.ErrorErrorCodeNotAllowlisted)
		wantError(t, a.call(r.method, r.path, "", ""), 401, api.ErrorErrorCodeUnauthenticated)
	}
	if len(a.bucket.objs) != 0 {
		t.Fatal("a rejected member must not start a backup")
	}
}

func decodeBackup(t *testing.T, raw []byte) api.Backup {
	t.Helper()
	var b api.Backup
	if err := json.Unmarshal(raw, &b); err != nil {
		t.Fatal(err)
	}
	return b
}

func listBackups(t *testing.T, a *testAPI) []api.Backup {
	t.Helper()
	rec := a.call("GET", "/v1/admin/backups", tokAdmin, "")
	if rec.Code != 200 {
		t.Fatalf("list = %d %s", rec.Code, rec.Body)
	}
	var out struct{ Items []api.Backup }
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	return out.Items
}

func waitFor(t *testing.T, ok func() bool) {
	t.Helper()
	for i := 0; i < 500; i++ {
		if ok() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("timed out")
}

func TestBackupNowListAndDownloadEncrypted(t *testing.T) {
	a := newBackupAPI(t, nil)
	rec := a.call("POST", "/v1/admin/backups", tokAdmin, "")
	if rec.Code != 202 {
		t.Fatalf("start = %d %s", rec.Code, rec.Body)
	}
	started := decodeBackup(t, rec.Body.Bytes())
	if started.Kind != api.BackupKind("manual") || started.Status != api.BackupStatus("running") {
		t.Fatalf("started = %+v", started)
	}
	waitFor(t, func() bool {
		items := listBackups(t, a.testAPI)
		return len(items) == 1 && items[0].Status == api.BackupStatus("succeeded")
	})
	item := listBackups(t, a.testAPI)[0]
	if size, err := item.SizeBytes.Get(); err != nil || size <= 0 {
		t.Fatalf("size = %d, %v", size, err)
	}

	dl := a.call("GET", "/v1/admin/backups/"+item.Id+"/download", tokAdmin, "")
	if dl.Code != 200 || dl.Header().Get("Content-Type") != "application/octet-stream" {
		t.Fatalf("download = %d %s", dl.Code, dl.Header())
	}
	if !strings.Contains(dl.Header().Get("Content-Disposition"), ".sqlite.age") {
		t.Fatalf("disposition = %q", dl.Header().Get("Content-Disposition"))
	}
	body := dl.Body.Bytes()
	if strings.Contains(string(body), "SQLite format") {
		t.Fatal("download is not encrypted")
	}
	var plain strings.Builder
	if err := backup.Decrypt(&plain, strings.NewReader(string(body)), a.id); err != nil {
		t.Fatalf("download must be the age archive: %v", err)
	}
	if !strings.HasPrefix(plain.String(), "SQLite format") {
		t.Fatal("decrypted download is not a database")
	}

	st := a.call("GET", "/v1/admin/status", tokAdmin, "")
	var status api.AdminStatus
	if err := json.Unmarshal(st.Body.Bytes(), &status); err != nil {
		t.Fatal(err)
	}
	last, err := status.Backups.LastRun.Get()
	if err != nil || last.Id != item.Id || last.Status != api.BackupStatus("succeeded") {
		t.Fatalf("last run = %+v, %v", last, err)
	}
}

func TestBackupNowConflictAndNotReady(t *testing.T) {
	release := make(chan struct{})
	a := newBackupAPI(t, release)
	rec := a.call("POST", "/v1/admin/backups", tokAdmin, "")
	if rec.Code != 202 {
		t.Fatalf("start = %d %s", rec.Code, rec.Body)
	}
	running := decodeBackup(t, rec.Body.Bytes())
	wantError(t, a.call("POST", "/v1/admin/backups", tokAdmin, ""), 409, api.ErrorErrorCodeBackupInProgress)
	wantError(t, a.call("GET", "/v1/admin/backups/"+running.Id+"/download", tokAdmin, ""), 409, api.ErrorErrorCodeBackupNotReady)
	if items := listBackups(t, a.testAPI); len(items) != 1 || items[0].Status != api.BackupStatus("running") {
		t.Fatalf("items = %+v", items)
	}
	close(release)
	waitFor(t, func() bool {
		items := listBackups(t, a.testAPI)
		return len(items) == 1 && items[0].Status == api.BackupStatus("succeeded")
	})
}

func TestDownloadUnknownBackupIs404(t *testing.T) {
	a := newBackupAPI(t, nil)
	a.bucket.objs["manual/secret-not-a-snapshot.txt"] = []byte("x")
	for _, id := range []string{"nope", "run-1-1", "bWFudWFsL3NlY3JldC1ub3QtYS1zbmFwc2hvdC50eHQ" /* unlisted key */} {
		wantError(t, a.call("GET", "/v1/admin/backups/"+id+"/download", tokAdmin, ""), 404, api.ErrorErrorCodeNotFound)
	}
}

type failingBucket struct{ memBucket }

func (f *failingBucket) Put(context.Context, string, io.Reader, int64) error {
	return errors.New("bucket secret details")
}

func TestFailedBackupIsListedWithSafeMessage(t *testing.T) {
	id, _ := age.GenerateX25519Identity()
	fb := &failingBucket{memBucket{objs: map[string][]byte{}}}
	a := newTestAPIWith(t, func(db *sql.DB, d *Deps) {
		d.Backups = &backup.Service{DB: db, Bucket: fb, Recipient: id.Recipient(), TempDir: t.TempDir()}
	})
	if rec := a.call("POST", "/v1/admin/backups", tokAdmin, ""); rec.Code != 202 {
		t.Fatalf("start = %d", rec.Code)
	}
	waitFor(t, func() bool {
		items := listBackups(t, a)
		return len(items) == 1 && items[0].Status == api.BackupStatus("failed")
	})
	item := listBackups(t, a)[0]
	msg, _ := item.ErrorMessage.Get()
	if msg == "" || strings.Contains(msg, "secret") {
		t.Fatalf("message = %q", msg)
	}
	wantError(t, a.call("GET", "/v1/admin/backups/"+item.Id+"/download", tokAdmin, ""), 409, api.ErrorErrorCodeBackupNotReady)
}

func TestAdminStatus(t *testing.T) {
	a := newTestAPIWith(t, func(_ *sql.DB, d *Deps) {
		d.AuthCheck = func(context.Context) error { return errors.New("down") }
	})
	rec := a.call("GET", "/v1/admin/status", tokAdmin, "")
	if rec.Code != 200 {
		t.Fatalf("status = %d %s", rec.Code, rec.Body)
	}
	var st api.AdminStatus
	if err := json.Unmarshal(rec.Body.Bytes(), &st); err != nil {
		t.Fatal(err)
	}
	if st.Version != "test" || st.Database.SizeBytes <= 0 || st.UptimeSeconds < 0 {
		t.Fatalf("status = %+v", st)
	}
	if st.Database.LastWriteAt.IsNull() {
		t.Fatal("seeded categories should give a last write time")
	}
	if st.Backups.Retention.Weekly != 8 || st.Backups.Retention.Monthly != 12 || st.Backups.Schedule == "" {
		t.Fatalf("backups = %+v", st.Backups)
	}
	if !st.Backups.NextWeeklyAt.After(time.Now()) || !st.Backups.NextMonthlyAt.After(time.Now()) {
		t.Fatalf("next = %v %v", st.Backups.NextWeeklyAt, st.Backups.NextMonthlyAt)
	}
	if !st.Backups.LastRun.IsNull() {
		t.Fatal("no backup has run")
	}
	if st.AuthProvider.Status != api.AdminStatusAuthProviderStatusUnreachable {
		t.Fatalf("provider = %v", st.AuthProvider.Status)
	}
}

func TestAdminWithoutBackupsConfigured(t *testing.T) {
	a := newTestAPI(t)
	if items := listBackups(t, a); len(items) != 0 {
		t.Fatalf("items = %+v", items)
	}
	if rec := a.call("GET", "/v1/admin/status", tokAdmin, ""); rec.Code != 200 {
		t.Fatalf("status = %d %s", rec.Code, rec.Body)
	}
	wantError(t, a.call("POST", "/v1/admin/backups", tokAdmin, ""), 501, api.ErrorErrorCodeNotImplemented)
	wantError(t, a.call("GET", "/v1/admin/backups/x/download", tokAdmin, ""), 404, api.ErrorErrorCodeNotFound)
}

func addUserBody(uid string) string {
	return `{"firebase_uid":"` + uid + `","email":"new@example.com","display_name":"New Person"}`
}

func TestAdminAddAndListUsers(t *testing.T) {
	a := newTestAPI(t)
	rec := a.call("POST", "/v1/admin/users", tokAdmin, addUserBody("uid-new"))
	if rec.Code != 201 {
		t.Fatalf("add = %d %s", rec.Code, rec.Body)
	}
	var added api.AdminUser
	if err := json.Unmarshal(rec.Body.Bytes(), &added); err != nil {
		t.Fatal(err)
	}
	if added.FirebaseUid != "uid-new" || added.Role != api.AdminUserRole("member") || added.CreatedAt == nil {
		t.Fatalf("added = %+v", added)
	}

	list := a.call("GET", "/v1/admin/users", tokAdmin, "")
	var out struct{ Items []api.AdminUser }
	if err := json.Unmarshal(list.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	found := false
	for _, u := range out.Items {
		found = found || u.FirebaseUid == "uid-new"
	}
	if !found {
		t.Fatalf("list lacks the new user: %s", list.Body)
	}
	if strings.Contains(list.Body.String(), "amount") {
		t.Fatal("the users list must hold no entry data")
	}

	// The new user is allowlisted, seeded and isolated from the admin's data.
	var cats int
	if err := a.db.QueryRow(`SELECT COUNT(*) FROM categories WHERE user_id = ?`, added.Id).Scan(&cats); err != nil || cats < 8 {
		t.Fatalf("seeded categories = %d, %v", cats, err)
	}

	wantError(t, a.call("POST", "/v1/admin/users", tokAdmin, addUserBody("uid-new")), 409, api.ErrorErrorCodeUserExists)
}

func TestAdminAddUserValidation(t *testing.T) {
	a := newTestAPI(t)
	for _, body := range []string{
		`{"firebase_uid":"  "}`,
		`{"firebase_uid":"u1","role":"owner"}`,
		`{"firebase_uid":"u1","email":"not-an-email"}`,
	} {
		wantError(t, a.call("POST", "/v1/admin/users", tokAdmin, body), 400, api.ErrorErrorCodeInvalidRequest)
	}
	rec := a.call("POST", "/v1/admin/users", tokAdmin, `{"firebase_uid":"u2","role":"admin"}`)
	if rec.Code != 201 || !strings.Contains(rec.Body.String(), `"role":"admin"`) {
		t.Fatalf("admin role = %d %s", rec.Code, rec.Body)
	}
}
