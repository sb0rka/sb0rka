package invite

// Repository is an opaque persistence handle passed from RepositoryFactory to HookFactory.
// The invite persistence contract is defined by the internal implementation module.
type Repository any

// RepositoryFactory builds a Repository from the auth app database.
type RepositoryFactory func(database any) Repository
