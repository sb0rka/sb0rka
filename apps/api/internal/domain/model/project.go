package model

import (
	"time"

	"github.com/google/uuid"
)

const (
	PrjMemberRoleOwner  = "owner"
	PrjMemberRoleAdmin  = "admin"
	PrjMemberRoleEditor = "editor"
	PrjMemberRoleViewer = "viewer"
)

type Project struct {
	ID               string    `json:"id"`
	OwnerSubjectID   uuid.UUID `json:"owner_subject_id"`
	BillingSubjectID uuid.UUID `json:"billing_subject_id"`
	PlanID           uuid.UUID `json:"plan_id"`
	Name             string    `json:"name"`
	Description      *string   `json:"description,omitempty"`
	IsActive         bool      `json:"is_active"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

type ProjectMember struct {
	ProjectID string    `json:"project_id"`
	SubjectID uuid.UUID `json:"subject_id"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
