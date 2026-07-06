package contract

import "time"

type OrganizationCreateRequest struct {
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
}

type OrganizationUpdateRequest struct {
	Name        *string `json:"name,omitempty"`
	Description *string `json:"description,omitempty"`
}

type OrganizationResponse struct {
	ID          string                       `json:"id"`
	Name        string                       `json:"name"`
	Description *string                      `json:"description,omitempty"`
	CreatedAt   time.Time                    `json:"created_at"`
	UpdatedAt   time.Time                    `json:"updated_at"`
	Members     []OrganizationMemberResponse `json:"members,omitempty"`
}

type OrganizationListResponse struct {
	Organizations []OrganizationResponse `json:"organizations"`
}

type OrganizationMemberCreateRequest struct {
	UserID string `json:"user_id"`
	Role   string `json:"role"`
}

type OrganizationMemberUpdateRequest struct {
	Role string `json:"role"`
}

type OrganizationMemberInviteCreateRequest struct {
	Username *string `json:"username,omitempty"`
	Email *string `json:"email,omitempty"`
	Role  string `json:"role"`
}

type OrganizationMemberResponse struct {
	UserID    string    `json:"user_id"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type OrganizationMemberListResponse struct {
	ID      string                       `json:"id"`
	Members []OrganizationMemberResponse `json:"members"`
}

// Status is one of: pending, accepted, expired, revoked.
// Email/Username may be absent if the invited user was removed.
type OrganizationInviteResponse struct {
	ID              string     `json:"id"`
	OrganizationID  string     `json:"organization_id"`
	Role            string     `json:"role"`
	Status          string     `json:"status"`
	Email           *string    `json:"email,omitempty"`
	Username        *string    `json:"username,omitempty"`
	CreatedByUserID *string    `json:"created_by_user_id,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
	ExpiresAt       *time.Time `json:"expires_at,omitempty"`
}

type OrganizationInviteListResponse struct {
	Invites []OrganizationInviteResponse `json:"invites"`
}
