package subject

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sb0rka/sb0rka/packages/contract"
)

// ErrProfileNotFound is returned by a ProfileResolver when the subject has no
// backing profile; the caller answers 401.
var ErrProfileNotFound = errors.New("subject profile not found")

// Profile is the resolved profile of a subject. A resolver fills IsActive and
// exactly one kind-specific field; the transport layer copies them into the
// API response, so resolvers cannot touch the rest of it. The response schema
// stays typed: supporting a new subject kind requires a profile field here and
// in contract.SubjectResponse.
type Profile struct {
	IsActive     bool
	Organization *contract.SubjectOrganizationProfile
}

// ProfileResolver resolves the profile of one subject kind.
type ProfileResolver func(ctx context.Context, subjectID uuid.UUID) (Profile, error)

// ResolverFactory builds profile resolvers on top of the auth database pool,
// keyed by subject kind. The "user" kind is resolved by the core service and
// cannot be registered; registering the same kind twice fails app startup.
type ResolverFactory func(pool *pgxpool.Pool) map[string]ProfileResolver
