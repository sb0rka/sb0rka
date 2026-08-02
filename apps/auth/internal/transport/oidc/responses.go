package oidc

import (
	"crypto/rsa"
	"encoding/base64"
	"math/big"

	"github.com/sb0rka/sb0rka/apps/auth/internal/store/db"
	"github.com/sb0rka/sb0rka/packages/contract"
)

// ToOIDCDiscoveryResponse exposes only the provider capabilities implemented by the OIDC transport.
func ToOIDCDiscoveryResponse(issuer string) contract.OIDCDiscoveryResponse {
	return contract.OIDCDiscoveryResponse{
		Issuer:                        issuer,
		AuthorizationEndpoint:         issuer + "/oauth2/authorize",
		TokenEndpoint:                 issuer + "/oauth2/token",
		RevocationEndpoint:            issuer + "/oauth2/revoke",
		JWKSURI:                       issuer + "/oauth2/jwks",
		ResponseTypesSupported:        []string{"code"},
		ResponseModesSupported:        []string{"query"},
		GrantTypesSupported:           []string{"authorization_code", "refresh_token"},
		SubjectTypesSupported:         []string{"public"},
		IDTokenSigningAlgorithms:      []string{"RS256"},
		TokenEndpointAuthMethods:      []string{"client_secret_basic"},
		CodeChallengeMethodsSupported: []string{"S256"},
		ScopesSupported:               []string{"openid", "profile", "email", "offline_access"},
		ClaimsSupported:               []string{"sub", "aud", "iss", "iat", "exp", "nonce", "auth_time", "amr", "preferred_username", "email", "email_verified", "at_hash"},
	}
}

// ToOIDCJWKSResponse converts the active RSA public key into the public verification DTO.
func ToOIDCJWKSResponse(publicKey *rsa.PublicKey, kid string) contract.OIDCJWKSResponse {
	e := big.NewInt(int64(publicKey.E)).Bytes()
	return contract.OIDCJWKSResponse{Keys: []contract.OIDCJWKResponse{{
		KTY: "RSA",
		Use: "sig",
		Alg: "RS256",
		KID: kid,
		N:   base64.RawURLEncoding.EncodeToString(publicKey.N.Bytes()),
		E:   base64.RawURLEncoding.EncodeToString(e),
	}}}
}

// ToOIDCContinuationResponse exposes only the validated redirect target returned to the console.
func ToOIDCContinuationResponse(target string) contract.OIDCContinuationResponse {
	return contract.OIDCContinuationResponse{RedirectTo: target}
}

// ToOAuthErrorResponse exposes only the protocol error code. error_description is
// optional per RFC 6749 and intentionally omitted from client responses.
func ToOAuthErrorResponse(protocolErr *protocolError) contract.OAuthErrorResponse {
	return contract.OAuthErrorResponse{Error: protocolErr.Code}
}

// ToOAuthTokenResponse exposes only the standard token endpoint fields and never internal session data.
func ToOAuthTokenResponse(tokens db.OIDCTokenSet) contract.OAuthTokenResponse {
	return contract.OAuthTokenResponse{
		AccessToken:  tokens.AccessToken,
		RefreshToken: tokens.RefreshToken,
		TokenType:    "Bearer",
		ExpiresIn:    tokens.ExpiresIn,
		IDToken:      tokens.IDToken,
		Scope:        canonicalScopes,
	}
}
