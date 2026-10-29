package quota

import (
	"context"

	"github.com/google/uuid"
	"github.com/sb0rka/sb0rka/packages/contract"
)

// StatusError exposes controlled 4xx errors through coretransport.WriteHookError.
type StatusError struct {
	Status  int
	Message string
}

func (e *StatusError) Error() string         { return e.Message }
func (e *StatusError) StatusCode() int       { return e.Status }
func (e *StatusError) ClientMessage() string { return e.Message }

type Hook interface {
	BeforeCreateProject(ctx context.Context, billingSubjectID uuid.UUID) error
	BeforeCreateResource(ctx context.Context, billingSubjectID uuid.UUID, projectID uuid.UUID, kind string) error
	ListProjectQuotas(ctx context.Context, projectID uuid.UUID) ([]contract.ProjectQuotaItemResponse, error)
}

type HookFactory func(repo Repository) Hook

func Noop() Hook { return noop{} }

type noop struct{}

func (noop) BeforeCreateProject(context.Context, uuid.UUID) error { return nil }

func (noop) BeforeCreateResource(context.Context, uuid.UUID, uuid.UUID, string) error { return nil }

func (noop) ListProjectQuotas(context.Context, uuid.UUID) ([]contract.ProjectQuotaItemResponse, error) {
	return []contract.ProjectQuotaItemResponse{}, nil
}
