package store

import (
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

type pgxPoolAccessor interface {
	PgxPool() *pgxpool.Pool
}

func PgxPool(db Database) (*pgxpool.Pool, error) {
	accessor, ok := db.(pgxPoolAccessor)
	if !ok {
		return nil, fmt.Errorf("database does not expose pgx pool")
	}
	return accessor.PgxPool(), nil
}
