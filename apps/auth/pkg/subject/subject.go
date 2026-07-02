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

// ProfileResolver fills the typed profile section of resp for one subject kind.
// Implementations set resp.IsActive and the kind-specific profile field.
type ProfileResolver func(ctx context.Context, subjectID uuid.UUID, resp *contract.SubjectResponse) error

// ResolverFactory builds profile resolvers on top of the auth database pool,
// keyed by subject kind. Kinds without a registered resolver are rejected by
// GET /auth/subject.
type ResolverFactory func(pool *pgxpool.Pool) map[string]ProfileResolver
