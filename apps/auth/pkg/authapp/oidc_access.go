package authapp

import (
	"errors"
	"reflect"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sb0rka/sb0rka/apps/auth/pkg/oidcaccess"
)

func (opts Options) buildOIDCAccessHook(pool *pgxpool.Pool) (oidcaccess.Hook, error) {
	if opts.OIDCAccessRepositoryFactory == nil && opts.OIDCAccessHookFactory == nil {
		return oidcaccess.Noop(), nil
	}
	if opts.OIDCAccessRepositoryFactory == nil || opts.OIDCAccessHookFactory == nil {
		return nil, errors.New("OIDC access requires both repository and hook factories")
	}
	repo := opts.OIDCAccessRepositoryFactory(pool)
	if nilFactoryResult(repo) {
		return nil, errors.New("OIDC access repository factory returned nil")
	}
	hook := opts.OIDCAccessHookFactory(repo)
	if nilFactoryResult(hook) {
		return nil, errors.New("OIDC access hook factory returned nil")
	}
	return hook, nil
}

// A factory can return a typed nil pointer through either extension interface.
func nilFactoryResult(result any) bool {
	v := reflect.ValueOf(result)
	switch v.Kind() {
	case reflect.Invalid:
		return true
	case reflect.Chan, reflect.Func, reflect.Map, reflect.Pointer, reflect.Slice:
		return v.IsNil()
	default:
		return false
	}
}
