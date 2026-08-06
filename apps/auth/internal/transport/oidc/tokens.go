package oidc

import (
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/sb0rka/sb0rka/apps/auth/internal/config"
	"github.com/sb0rka/sb0rka/apps/auth/internal/domain/model"
	"github.com/sb0rka/sb0rka/apps/auth/internal/service"
	"github.com/sb0rka/sb0rka/apps/auth/internal/store/db"
)

type tokenIssuer struct {
	config     config.OIDCConfig
	authConfig config.AuthConfig
}

type idTokenClaims struct {
	jwt.RegisteredClaims
	Nonce              string   `json:"nonce"`
	AuthenticationTime int64    `json:"auth_time"`
	AMR                []string `json:"amr"`
	PreferredUsername  string   `json:"preferred_username"`
	Email              string   `json:"email"`
	EmailVerified      bool     `json:"email_verified"`
	AccessTokenHash    string   `json:"at_hash"`
}

// newTokenIssuer snapshots signing and audience configuration for deterministic token issuance.
func newTokenIssuer(cfg config.OIDCConfig, authConfig config.AuthConfig) *tokenIssuer {
	return &tokenIssuer{config: cfg.Clone(), authConfig: authConfig}
}

// Issue creates the code-exchange ID token and its separate Platform access token.
func (i *tokenIssuer) Issue(user db.OIDCUserClaims, sessionID uuid.UUID, now time.Time) (db.OIDCTokenSet, error) {
	now = now.UTC().Truncate(time.Second)
	accessToken, err := service.CreateClientAccessToken(
		user.ID,
		sessionID,
		model.SubjectKindUser,
		i.config.ClientID,
		i.authConfig,
	)
	if err != nil {
		return db.OIDCTokenSet{}, fmt.Errorf("sign Platform access token: %w", err)
	}

	digest := sha256.Sum256([]byte(accessToken))
	idClaims := idTokenClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    i.config.Issuer,
			Subject:   user.ID.String(),
			Audience:  jwt.ClaimStrings{i.config.ClientID},
			ExpiresAt: jwt.NewNumericDate(now.Add(tokenTTL)),
			IssuedAt:  jwt.NewNumericDate(now),
			ID:        uuid.NewString(),
		},
		Nonce:              user.Nonce,
		AuthenticationTime: user.AuthenticationTime.UTC().Unix(),
		AMR:                []string{"pwd"},
		PreferredUsername:  user.Username,
		Email:              user.Email,
		EmailVerified:      user.EmailVerified,
		AccessTokenHash:    base64.RawURLEncoding.EncodeToString(digest[:len(digest)/2]),
	}
	idToken, err := i.signIDToken(idClaims)
	if err != nil {
		return db.OIDCTokenSet{}, fmt.Errorf("sign ID token: %w", err)
	}

	return db.OIDCTokenSet{
		AccessToken: accessToken,
		IDToken:     idToken,
		ExpiresIn:   int64(i.authConfig.AccessTokenTTL / time.Second),
	}, nil
}

// IssueAccessToken creates a replacement Platform access token after OAuth refresh rotation.
func (i *tokenIssuer) IssueAccessToken(subjectID, sessionID uuid.UUID) (string, error) {
	return service.CreateClientAccessToken(
		subjectID,
		sessionID,
		model.SubjectKindUser,
		i.config.ClientID,
		i.authConfig,
	)
}

// signIDToken applies the provider RS256 key and publishes its key identifier in the JOSE header.
func (i *tokenIssuer) signIDToken(claims jwt.Claims) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["kid"] = i.config.SigningKeyID
	token.Header["typ"] = "JWT"
	return token.SignedString(i.config.SigningPrivateKey)
}
