package model

import (
	"time"

	"github.com/google/uuid"
)

const (
	OrgMemberRoleOwner  = "owner"
	OrgMemberRoleAdmin  = "admin"
	OrgMemberRoleEditor = "editor"
	OrgMemberRoleViewer = "viewer"
)

type Organization struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Description *string   `json:"description,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type OrganizationMember struct {
	UserID         uuid.UUID `json:"user_id"`
	OrganizationID uuid.UUID `json:"organization_id"`
	Role           string    `json:"role"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}
