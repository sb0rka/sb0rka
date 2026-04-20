package app

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/sb0rka/sb0rka/apps/s0c/internal/auth"
	"github.com/sb0rka/sb0rka/apps/s0c/internal/client"
	"github.com/sb0rka/sb0rka/apps/s0c/internal/config"
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

func (s *AuthService) Login(ctx context.Context, usernameOrEmail string, password string) error {
	usernameOrEmail = strings.TrimSpace(usernameOrEmail)
	if usernameOrEmail == "" {
		return fmt.Errorf("username or email cannot be empty")
	}
	password = strings.TrimSpace(password)
	if password == "" {
		return fmt.Errorf("password cannot be empty")
	}

	_, authBaseURL := ResolveBaseURLs(s.getenv)
	refreshCookieName := ResolveRefreshTokenCookieName(s.getenv)
	authClient := s.newClient(
		authBaseURL,
		fmt.Sprintf("s0c/%s", s.version),
		client.WithRefreshTokenCookieName(refreshCookieName),
	)

	accessToken, refreshToken, expiresAt, err := authClient.Login(ctx, usernameOrEmail, password)
	if err != nil {
		return fmt.Errorf("login failed: %w", err)
	}

	state := auth.AuthState{
		RefreshToken: refreshToken,
		AccessToken:  accessToken,
	}
	state.AccessTokenExpiresAt = normalizeAccessTokenExpiry(expiresAt)

	if err := auth.SaveState(state); err != nil {
		return fmt.Errorf("save auth state: %w", err)
	}

	return nil
}

func (s *AuthService) Logout(ctx context.Context) error {
	_, authBaseURL := ResolveBaseURLs(s.getenv)
	refreshCookieName := ResolveRefreshTokenCookieName(s.getenv)
	authClient := s.newClient(
		authBaseURL,
		fmt.Sprintf("s0c/%s", s.version),
		client.WithRefreshTokenCookieName(refreshCookieName),
	)

	bearer, err := auth.GetValidAccessToken(ctx, authClient)
	if err != nil {
		return err
	}
	if err := authClient.Logout(ctx, bearer); err != nil {
		return fmt.Errorf("logout request failed: %w", err)
	}

	if err := auth.SaveState(auth.AuthState{}); err != nil {
		return fmt.Errorf("clear auth state: %w", err)
	}

	cfg, err := config.Load()
	if err != nil {
		return err
	}
	cfg.ProjectID = ""
	cfg.DatabaseID = ""
	if err := config.Save(cfg); err != nil {
		return fmt.Errorf("clear config defaults: %w", err)
	}

	return nil
}

func normalizeAccessTokenExpiry(expiresAt *time.Time) *time.Time {
	if expiresAt == nil || expiresAt.IsZero() {
		return nil
	}
	t := expiresAt.UTC()
	return &t
}
