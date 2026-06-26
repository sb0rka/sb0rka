package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Pool struct {
	pool *pgxpool.Pool
}

func NewPool(uri string, maxConns int, connMaxLifetime time.Duration) (*Pool, error) {
	pool, err := pgxpool.New(context.Background(), uri)
	if err != nil {
		return nil, err
	}

	pool.Config().MaxConns = int32(maxConns)
	pool.Config().MaxConnLifetime = connMaxLifetime

	return &Pool{pool: pool}, nil
}

func (p *Pool) Pgx() *pgxpool.Pool {
	return p.pool
}

func (p *Pool) Ping(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	return p.pool.Ping(ctx)
}

func (p *Pool) Close() {
	if p.pool != nil {
		p.pool.Close()
	}
}
