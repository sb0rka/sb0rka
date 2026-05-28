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
	PlanID      string `json:"plan_id"`
}

type UpdateProjectRequest struct {
	Name        *string `json:"name,omitempty"`
	Description *string `json:"description,omitempty"`
}

type ProjectResponse struct {
	ID               string    `json:"id"`
	OwnerSubjectID   string    `json:"owner_subject_id"`
	BillingSubjectID string    `json:"billing_subject_id"`
	PlanID           string    `json:"plan_id"`
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
	ProjectID string    `json:"project_id"`
	SubjectID string    `json:"subject_id"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type ProjectMemberListResponse struct {
	ProjectID string                      `json:"project_id"`
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
