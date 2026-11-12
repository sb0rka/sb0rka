package cli

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	corestore "github.com/sb0rka/sb0rka/packages/core/store"
)

func CreateDatabase(uri string, maxConns int, connMaxLifetime time.Duration) (Database, error) {
	return NewPsqlDB(uri, maxConns, connMaxLifetime)
}

type Database interface {
	TestConnection(ctx context.Context) error

	Close() error

	CleanTerminatedDatabases(ctx context.Context, log *slog.Logger) (uuid.UUID, error)
}

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

type cleanupTarget struct {
	ProjectID  uuid.UUID
	DatabaseID uuid.UUID
	SecretID   uuid.UUID
}

func (p *PsqlDB) cleanupOneDeletedDBI(ctx context.Context) (cleanupTarget, bool, error) {
	const query = `
		SELECT project_id, database_id, secret_id
		FROM api.cleanup_one_deleted_dbi()
	`

	var target cleanupTarget
	err := p.pool.QueryRow(ctx, query).Scan(&target.ProjectID, &target.DatabaseID, &target.SecretID)
	if err == pgx.ErrNoRows {
		return cleanupTarget{}, false, nil
	}
	if err != nil {
		return cleanupTarget{}, false, err
	}
	return target, true, nil
}

func (p *PsqlDB) CleanTerminatedDatabases(ctx context.Context, log *slog.Logger) (uuid.UUID, error) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	target, found, err := p.cleanupOneDeletedDBI(ctx)
	if err != nil {
		return uuid.Nil, err
	}
	if !found {
		return uuid.Nil, nil
	}

	log.Info("cleaned_resources", "project_id", target.ProjectID, "database_id", target.DatabaseID, "secret_id", target.SecretID)
	return target.ProjectID, nil
}

func (p *PsqlDB) Close() error {
	if p.pool != nil {
		p.pool.Close()
	}
	return nil
}
