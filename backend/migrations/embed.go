// Package migrations embeds the numbered SQL migration files.
package migrations

import "embed"

// FS holds every NNNN_name.sql migration.
//
//go:embed *.sql
var FS embed.FS
