package service

import (
	"context"

	"github.com/sb0rka/sb0rka/apps/api/internal/config"
	coreauth "github.com/sb0rka/sb0rka/packages/core/auth"
)

type AccessTokenIdentity = coreauth.AccessTokenIdentity
type AccessTokenClaims = coreauth.AccessTokenClaims

var ErrUnauthorized = coreauth.ErrUnauthorized

func verificationConfig(authConfig config.AuthConfig) (coreauth.VerificationConfig, error) {
	if authConfig.VerificationKeys == nil {
		return coreauth.VerificationConfig{}, coreauth.ErrKeysUnavailable
	}
	return coreauth.VerificationConfig{
		Keys:     authConfig.VerificationKeys,
		Issuer:   authConfig.AccessTokenIssuer,
		Audience: authConfig.AccessTokenAudience,
		Policy:   authConfig.AccessTokenPolicy,
	}, nil
}

func ParseBearerToken(authorizationHeader string) (string, error) {
	return coreauth.ParseBearerToken(authorizationHeader)
}

func ParseAndVerifyAccessTokenFromAuthHeader(ctx context.Context, authorizationHeader string, authConfig config.AuthConfig) (AccessTokenIdentity, error) {
	cfg, err := verificationConfig(authConfig)
	if err != nil {
		return AccessTokenIdentity{}, err
	}
	return coreauth.ParseAndVerifyAccessToken(ctx, authorizationHeader, cfg)
}

func VerifyAccessToken(ctx context.Context, rawToken string, authConfig config.AuthConfig) (AccessTokenIdentity, error) {
	cfg, err := verificationConfig(authConfig)
	if err != nil {
		return AccessTokenIdentity{}, err
	}
	return coreauth.VerifyAccessToken(ctx, rawToken, cfg)
}
