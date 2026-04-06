package app

import (
	"context"
	"fmt"
	"strings"

	"github.com/sb0rka/sb0rka/apps/s0c/internal/auth"
	"github.com/sb0rka/sb0rka/apps/s0c/internal/client"
)

type AuthService struct {
	getenv    func(string) string
	version   string
	newClient func(baseURL string, userAgent string, opts ...client.ClientOption) *client.Client
}

func NewAuthService(version string) *AuthService {
	return &AuthService{
		getenv:    nil,
		version:   version,
		newClient: client.NewClient,
	}
}

func (s *AuthService) SaveAndVerifyToken(ctx context.Context, refreshToken string) error {
	token := strings.TrimSpace(refreshToken)
	if token == "" {
		return fmt.Errorf("refresh token cannot be empty")
	}

	if err := auth.SaveState(auth.AuthState{RefreshToken: token}); err != nil {
		return fmt.Errorf("save auth state: %w", err)
	}

	_, authBaseURL, err := ResolveBaseURLs(s.getenv)
	if err != nil {
		return fmt.Errorf("resolve auth base URL: %w", err)
	}

	authClient := s.newClient(authBaseURL, fmt.Sprintf("s0c/%s", s.version))
	if _, err := auth.ForceRefreshAccessToken(ctx, authClient); err != nil {
		return fmt.Errorf("auth failed to fetch access token: %w", err)
	}

	return nil
}
