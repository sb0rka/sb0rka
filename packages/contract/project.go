package contract

import "time"

const (
	PrjMemberRoleOwner  = "owner"
	PrjMemberRoleAdmin  = "admin"
	PrjMemberRoleEditor = "editor"
	PrjMemberRoleViewer = "viewer"
)

type CreateProjectRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	PlanID      string `json:"plan_id" format:"uuid"`
}

type UpdateProjectRequest struct {
	Name        *string `json:"name,omitempty"`
	Description *string `json:"description,omitempty"`
}

type ProjectResponse struct {
	PublicID         string    `json:"public_id"`
	ID               string    `json:"id" format:"uuid"`
	OwnerSubjectID   string    `json:"owner_subject_id" format:"uuid"`
	BillingSubjectID string    `json:"billing_subject_id" format:"uuid"`
	PlanID           string    `json:"plan_id" format:"uuid"`
	Name             string    `json:"name"`
	Description      *string   `json:"description,omitempty"`
	IsActive         bool      `json:"is_active"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

type ProjectListResponse struct {
	Projects []ProjectResponse `json:"projects"`
}

type ProjectMemberResponse struct {
	ProjectID string    `json:"project_id" format:"uuid"`
	SubjectID string    `json:"subject_id"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type ProjectMemberListResponse struct {
	ProjectID string                      `json:"project_id" format:"uuid"`
	Members   []ProjectMemberItemResponse `json:"members"`
}

type ProjectMemberItemResponse struct {
	SubjectID string    `json:"subject_id"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type CreateProjectMemberRequest struct {
	SubjectID string `json:"subject_id"`
	Role      string `json:"role"`
}

type UpdateProjectMemberRoleRequest struct {
	Role string `json:"role"`
}
