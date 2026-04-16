package auth

import (
	"context"
	"time"
)

type AuthState struct {
	RefreshToken         string     `json:"refresh_token,omitempty"`
	AccessToken          string     `json:"access_token,omitempty"`
	AccessTokenExpiresAt *time.Time `json:"access_token_expires_at,omitempty"`
}

type Refresher interface {
	RefreshSession(ctx context.Context, refreshToken string) (accessToken string, nextRefreshToken string, expiresAt *time.Time, err error)
}
