package model

import (
	"net"
	"time"

	"github.com/google/uuid"
)

const SubjectKindUser = "user"

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
	OAuthClientID    *string    `json:"oauth_client_id,omitempty"`
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

// BrowserSession is the read-only identity projection exposed to browser-cookie
// authentication. Credential hashes and rotation-family details stay in the store.
type BrowserSession struct {
	SubjectID          uuid.UUID
	SessionID          uuid.UUID
	AuthenticationTime time.Time
}

type User struct {
	ID              uuid.UUID  `json:"id"`
	IsActive        bool       `json:"is_active"`
	Username        string     `json:"username"`
	Email           string     `json:"email"`
	EmailVerifiedAt *time.Time `json:"email_verified_at,omitempty"`
	Phone           *int32     `json:"phone,omitempty"`
	PhoneVerifiedAt *time.Time `json:"phone_verified_at,omitempty"`
	PasswordHash    string     `json:"password_hash"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}
