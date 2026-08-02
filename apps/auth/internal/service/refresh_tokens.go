package service

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"strings"

	"github.com/sb0rka/sb0rka/apps/auth/internal/config"
)

// ValidateLengthOfRefreshToken validates an opaque refresh token received from cookie
func ValidateLengthOfRefreshToken(refreshTokenRaw string, authConfig config.AuthConfig) (string, error) {
	refreshToken := strings.TrimSpace(refreshTokenRaw)
	if refreshToken == "" {
		return "", fmt.Errorf("%w: empty refresh token", ErrUnauthorized)
	}

	expectedLen := base64.RawURLEncoding.EncodedLen(authConfig.RefreshTokenLen)
	if len(refreshToken) != expectedLen {
		return "", fmt.Errorf("%w: invalid refresh token length", ErrUnauthorized)
	}

	decoded, err := base64.RawURLEncoding.DecodeString(refreshToken)
	if err != nil {
		return "", fmt.Errorf("%w: invalid refresh token encoding", ErrUnauthorized)
	}
	if len(decoded) != authConfig.RefreshTokenLen {
		return "", fmt.Errorf("%w: invalid refresh token payload length", ErrUnauthorized)
	}

	return refreshToken, nil
}

// HashRefreshToken computes DB-safe SHA-256 hash of an opaque refresh token
func HashRefreshToken(refreshToken string) string {
	sum := sha256.Sum256([]byte(refreshToken))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

// CreateRefreshTokenPair creates an opaque refresh token and its DB-safe hash
func CreateRefreshTokenPair(authConfig config.AuthConfig) (refreshToken string, refreshTokenHash string, err error) {
	raw := make([]byte, authConfig.RefreshTokenLen)
	if _, err := rand.Read(raw); err != nil {
		return "", "", fmt.Errorf("generate refresh token error: %w", err)
	}

	refreshToken = base64.RawURLEncoding.EncodeToString(raw)
	refreshTokenHash = HashRefreshToken(refreshToken)
	return refreshToken, refreshTokenHash, nil
}
