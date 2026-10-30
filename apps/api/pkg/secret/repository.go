package secret

import "github.com/jackc/pgx/v5/pgxpool"

type Repository any

type RepositoryFactory func(pool *pgxpool.Pool) Repository
