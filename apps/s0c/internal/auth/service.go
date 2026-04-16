package auth

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"
)

const accessTokenSkew = 30 * time.Second

var (
	ErrAuthNotConfigured   = errors.New("auth is not configured")
	ErrRefreshTokenMissing = errors.New("refresh token is missing")
)

func GetValidAccessToken(ctx context.Context, refresher Refresher) (string, error) {
	state, err := LoadState()
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", fmt.Errorf("%w, run 's0c auth login' first", ErrAuthNotConfigured)
		}
		return "", fmt.Errorf("load auth state: %w", err)
	}

	if strings.TrimSpace(state.RefreshToken) == "" {
		return "", fmt.Errorf("%w, run 's0c auth login' first", ErrRefreshTokenMissing)
	}

	now := time.Now()
	if isAccessTokenValid(state, now) {
		return state.AccessToken, nil
	}

	updatedState, err := RefreshAccessToken(ctx, refresher, state)
	if err != nil {
		return "", err
	}

	if err := SaveState(updatedState); err != nil {
		return "", fmt.Errorf("save refreshed auth state: %w", err)
	}

	return updatedState.AccessToken, nil
}

func ForceRefreshAccessToken(ctx context.Context, refresher Refresher) (string, error) {
	state, err := LoadState()
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", fmt.Errorf("%w, run 's0c auth login' first", ErrAuthNotConfigured)
		}
		return "", fmt.Errorf("load auth state: %w", err)
	}
	if strings.TrimSpace(state.RefreshToken) == "" {
		return "", fmt.Errorf("%w, run 's0c auth login' first", ErrRefreshTokenMissing)
	}

	updatedState, err := RefreshAccessToken(ctx, refresher, state)
	if err != nil {
		return "", err
	}
	if err := SaveState(updatedState); err != nil {
		return "", fmt.Errorf("save refreshed auth state: %w", err)
	}
	return updatedState.AccessToken, nil
}

func RefreshAccessToken(ctx context.Context, refresher Refresher, state AuthState) (AuthState, error) {
	accessToken, nextRefreshToken, expiresAt, err := refresher.RefreshSession(ctx, state.RefreshToken)
	if err != nil {
		return AuthState{}, fmt.Errorf("refresh access token: %w", err)
	}

	access := strings.TrimSpace(accessToken)
	if access == "" {
		return AuthState{}, fmt.Errorf("refresh endpoint did not return access token")
	}
	state.AccessToken = access

	if rt := strings.TrimSpace(nextRefreshToken); rt != "" {
		state.RefreshToken = rt
	}

	if expiresAt == nil || expiresAt.IsZero() {
		return AuthState{}, fmt.Errorf("refresh endpoint did not return token expiry")
	}
	state.AccessTokenExpiresAt = expiresAt

	return state, nil
}

func isAccessTokenValid(state AuthState, now time.Time) bool {
	if strings.TrimSpace(state.AccessToken) == "" {
		return false
	}
	if state.AccessTokenExpiresAt == nil || state.AccessTokenExpiresAt.IsZero() {
		return false
	}

	return now.Add(accessTokenSkew).Before(*state.AccessTokenExpiresAt)
}
