package backup

import (
	"context"
	"io"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// S3 is a Bucket on any S3-compatible service (B2, R2, Wasabi, AWS S3).
type S3 struct {
	client *minio.Client
	bucket string
}

// NewS3 connects to the endpoint (host[:port], no scheme).
func NewS3(endpoint, bucket, region, accessKey, secretKey string, insecure bool) (*S3, error) {
	c, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: !insecure,
		Region: region,
	})
	if err != nil {
		return nil, err
	}
	return &S3{client: c, bucket: bucket}, nil
}

func (b *S3) Put(ctx context.Context, key string, r io.Reader, size int64) error {
	_, err := b.client.PutObject(ctx, b.bucket, key, r, size, minio.PutObjectOptions{ContentType: "application/octet-stream"})
	return err
}

func (b *S3) List(ctx context.Context, prefix string) ([]Object, error) {
	var out []Object
	for o := range b.client.ListObjects(ctx, b.bucket, minio.ListObjectsOptions{Prefix: prefix, Recursive: true}) {
		if o.Err != nil {
			return nil, o.Err
		}
		out = append(out, Object{Key: o.Key, Size: o.Size})
	}
	return out, nil
}

func (b *S3) Get(ctx context.Context, key string) (io.ReadCloser, error) {
	return b.client.GetObject(ctx, b.bucket, key, minio.GetObjectOptions{})
}

func (b *S3) Delete(ctx context.Context, key string) error {
	return b.client.RemoveObject(ctx, b.bucket, key, minio.RemoveObjectOptions{})
}
