package membership

import (
	"context"

	"github.com/google/uuid"
)

// StatusError exposes controlled 4xx errors through coretransport.WriteHookError.
type StatusError struct {
	Status  int
	Message string
}

func (e *StatusError) Error() string         { return e.Message }
func (e *StatusError) StatusCode() int       { return e.Status }
func (e *StatusError) ClientMessage() string { return e.Message }

// Hook runs before a subject is granted project membership and when a project
// is created for an organization.
type Hook interface {
	BeforeAddProjectMember(
		ctx context.Context,
		projectID uuid.UUID,
		ownerSubjectID uuid.UUID,
		targetSubjectID uuid.UUID,
		targetKind string,
	) error
	// ResolveOrganizationBilling returns the user billed for a project owned by
	// the organization. The caller must be that organization's owner.
	ResolveOrganizationBilling(ctx context.Context, callerID, organizationID uuid.UUID) (uuid.UUID, error)
}

// HookFactory builds a Hook from an opaque repository.
type HookFactory func(repo Repository) Hook

func Noop() Hook { return noop{} }

type noop struct{}

func (noop) BeforeAddProjectMember(
	context.Context,
	uuid.UUID,
	uuid.UUID,
	uuid.UUID,
	string,
) error {
	return nil
}

func (noop) ResolveOrganizationBilling(context.Context, uuid.UUID, uuid.UUID) (uuid.UUID, error) {
	return uuid.Nil, &StatusError{
		Status:  403,
		Message: "Only the organization owner can create a project for the organization",
	}
}
