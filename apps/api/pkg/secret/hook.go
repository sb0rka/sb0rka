package secret

import (
	"context"
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/sb0rka/sb0rka/packages/contract"
)

type StatusError struct {
	Status  int
	Message string
}

func (e *StatusError) Error() string         { return e.Message }
func (e *StatusError) StatusCode() int       { return e.Status }
func (e *StatusError) ClientMessage() string { return e.Message }

// Version is request-scoped; Value must never be logged or persisted in plaintext.
type Version struct {
	ProjectID uuid.UUID
	SecretID  uuid.UUID
	VersionNo int32
	Value     string
}

type Hook interface {
	GenerateValue(ctx context.Context, payloadKind, purpose string) (string, error)
	VersionPurpose(ctx context.Context, projectID, secretID uuid.UUID) (string, error)
	Digests(ctx context.Context, projectID, secretID uuid.UUID) (map[int32]contract.SecretVersionDigestResponse, error)
	// AfterVersion participates in the caller's transaction and must not commit it.
	AfterVersion(ctx context.Context, tx pgx.Tx, version Version, purpose string) (*contract.SecretVersionDigestResponse, error)
}

type HookFactory func(repo Repository) Hook

func Noop() Hook { return noop{} }

type noop struct{}

func unsupported() error {
	return &StatusError{Status: http.StatusUnprocessableEntity, Message: "Secret generation is not supported"}
}

func (noop) GenerateValue(context.Context, string, string) (string, error) {
	return "", unsupported()
}

func (noop) VersionPurpose(context.Context, uuid.UUID, uuid.UUID) (string, error) {
	return "", nil
}

func (noop) Digests(context.Context, uuid.UUID, uuid.UUID) (map[int32]contract.SecretVersionDigestResponse, error) {
	return nil, nil
}

func (noop) AfterVersion(_ context.Context, _ pgx.Tx, _ Version, purpose string) (*contract.SecretVersionDigestResponse, error) {
	if purpose != "" {
		return nil, unsupported()
	}
	return nil, nil
}
