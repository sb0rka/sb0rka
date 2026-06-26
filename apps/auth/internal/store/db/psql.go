package db

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	corestore "github.com/sb0rka/sb0rka/packages/core/store"
)

type PsqlDB struct {
	pool *pgxpool.Pool
}

func NewPsqlDB(uri string, maxConns int, connMaxLifetime time.Duration) (*PsqlDB, error) {
	corePool, err := corestore.NewPool(uri, maxConns, connMaxLifetime)
	if err != nil {
		return nil, err
	}

	return &PsqlDB{pool: corePool.Pgx()}, nil
}

func (p *PsqlDB) TestConnection(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	return p.pool.Ping(ctx)
}

func (p *PsqlDB) Close() error {
	if p.pool != nil {
		p.pool.Close()
	}
	return nil
}

func (p *PsqlDB) PgxPool() *pgxpool.Pool {
	return p.pool
}
