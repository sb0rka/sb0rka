package model

import (
	"net"
	"time"

	"github.com/google/uuid"
)

const (
	SubjectKindUser         = "user"
	SubjectKindOrganization = "organization"
)

type Subject struct {
	ID        uuid.UUID `json:"id"`
	Kind      string    `json:"kind"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type AuthSession struct {
	ID               uuid.UUID  `json:"id"`
	SubjectID        uuid.UUID  `json:"subject_id"`
	SubjectKind      string     `json:"subject_kind"`
	FamilyID         uuid.UUID  `json:"family_id"`
	RefreshTokenHash string     `json:"refresh_token_hash"`
	CreatedIP        net.IP     `json:"created_ip"`
	CreatedUserAgent *string    `json:"created_user_agent,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
	ExpiresAt        time.Time  `json:"expires_at"`
	RevokedAt        *time.Time `json:"revoked_at,omitempty"`
	RevokeReason     *string    `json:"revoke_reason,omitempty"`
	ReplacedBy       *uuid.UUID `json:"replaced_by,omitempty"`
}

type User struct {
	ID           uuid.UUID `json:"id"`
	IsActive     bool      `json:"is_active"`
	Username     string    `json:"username"`
	Email        string    `json:"email"`
	Phone        *int32    `json:"phone,omitempty"`
	PasswordHash string    `json:"password_hash"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}
