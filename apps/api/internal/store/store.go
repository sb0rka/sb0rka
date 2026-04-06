package store

import "github.com/sb0rka/sb0rka/apps/api/internal/store/db"

type Database = db.Database

func CreateDatabase(uri string, maxConns int, connMaxLifetime int64) (Database, error) {
	return db.CreateDatabase(uri, maxConns, connMaxLifetime)
}
