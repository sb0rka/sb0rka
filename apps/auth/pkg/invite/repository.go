package invite

import "github.com/jackc/pgx/v5/pgxpool"

// Repository is an opaque persistence handle passed from RepositoryFactory to HookFactory.
// The invite persistence contract is defined by the module that implements the hook.
type Repository any

// RepositoryFactory builds a Repository on top of the auth database pool.
type RepositoryFactory func(pool *pgxpool.Pool) Repository
