package service

import (
	"crypto/ed25519"
	"fmt"

	"github.com/sb0rka/sb0rka/apps/api/internal/config"
	coreauth "github.com/sb0rka/sb0rka/packages/core/auth"
)

type AccessTokenIdentity = coreauth.AccessTokenIdentity
type AccessTokenClaims = coreauth.AccessTokenClaims

var ErrUnauthorized = coreauth.ErrUnauthorized

func verificationConfig(authConfig config.AuthConfig) (coreauth.VerificationConfig, error) {
	publicKey, ok := authConfig.AccessTokenPrivateKey.Public().(ed25519.PublicKey)
	if !ok {
		return coreauth.VerificationConfig{}, fmt.Errorf("%w: invalid access token key", ErrUnauthorized)
	}
	return coreauth.VerificationConfig{
		PublicKey: publicKey,
		KeyID:     authConfig.AccessTokenKid,
		TokenType: authConfig.AccessTokenTyp,
		Issuer:    authConfig.AccessTokenIssuer,
		Audience:  authConfig.AccessTokenAudience,
	}, nil
}

func ParseBearerToken(authorizationHeader string) (string, error) {
	return coreauth.ParseBearerToken(authorizationHeader)
}

func ParseAndVerifyAccessTokenFromAuthHeader(authorizationHeader string, authConfig config.AuthConfig) (AccessTokenIdentity, error) {
	cfg, err := verificationConfig(authConfig)
	if err != nil {
		return AccessTokenIdentity{}, err
	}
	return coreauth.ParseAndVerifyAccessToken(authorizationHeader, cfg)
}

func VerifyAccessToken(rawToken string, authConfig config.AuthConfig) (AccessTokenIdentity, error) {
	cfg, err := verificationConfig(authConfig)
	if err != nil {
		return AccessTokenIdentity{}, err
	}
	return coreauth.VerifyAccessToken(rawToken, cfg)
}
