package contract

import "time"

type VerificationEmailStatusResponse struct {
	Email      string     `json:"email"`
	Verified   bool       `json:"verified"`
	VerifiedAt *time.Time `json:"verified_at"`
}

type VerificationEmailIssueResponse struct {
	VerificationID string    `json:"verification_id"`
	ExpiresAt      time.Time `json:"expires_at"`
}

type VerificationEmailConfirmRequest struct {
	VerificationID string `json:"verification_id"`
	Code           string `json:"code"`
}
