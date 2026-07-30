package verification

import (
	"context"

	"github.com/google/uuid"
)

// StatusError is the only error a Hook may surface to the client. Status must
// be a client error (4xx); other errors are logged and returned as generic 500.
type StatusError struct {
	Status  int
	Message string
}

func (e *StatusError) Error() string { return e.Message }

func (e *StatusError) StatusCode() int { return e.Status }

func (e *StatusError) ClientMessage() string { return e.Message }

// Hook runs before a handler that requires a verified email.
type Hook interface {
	BeforeAccess(ctx context.Context, userID uuid.UUID) error
}

// HookFactory builds a Hook from an opaque repository.
type HookFactory func(repo Repository) Hook

func Noop() Hook { return noop{} }

type noop struct{}

func (noop) BeforeAccess(context.Context, uuid.UUID) error { return nil }
