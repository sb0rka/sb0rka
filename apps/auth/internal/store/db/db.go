package db

import (
	"context"
	"time"

	"github.com/sb0rka/sb0rka/apps/auth/internal/domain/model"

	coreauth "github.com/sb0rka/sb0rka/packages/core/auth"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func CreateDatabase(uri string, maxConns int, connMaxLifetime int64) (Database, error) {
	return NewPsqlDB(uri, maxConns, time.Duration(connMaxLifetime))
}

type Database interface {
	TestConnection(ctx context.Context) error

	Close() error

	// PgxPool exposes the underlying connection pool. It exists only to hand
	// the pool to pluggable feature modules (route/invite/subject factories);
	// queries must go through the interface methods.
	PgxPool() *pgxpool.Pool

	// --- Platform identity (delegation, platform clients, agents) ---

	PlatformClient(ctx context.Context, clientID string) (PlatformClient, error)
	ClientPolicies(ctx context.Context) ([]coreauth.ClientPolicy, error)
	CreateDelegationRequest(ctx context.Context, request DelegationRequest) error
	DelegationRequest(ctx context.Context, requestID uuid.UUID) (DelegationRequest, error)
	DelegationGrant(ctx context.Context, subjectID uuid.UUID, clientID, audience string) (DelegationGrant, error)
	ApproveDelegation(ctx context.Context, requestID, subjectID, consentSessionID uuid.UUID, scopes, projectIDs []string, codeHash []byte) (DelegationGrant, error)
	DenyDelegation(ctx context.Context, requestID, subjectID uuid.UUID) error
	RedeemDelegation(ctx context.Context, codeHash []byte, clientID, redirectURI, codeVerifier string) (DelegationGrant, error)
	RevokeDelegation(ctx context.Context, subjectID uuid.UUID, clientID, audience string) error
	LiveSession(ctx context.Context, sessionID, subjectID uuid.UUID) (bool, error)
	LiveDelegation(ctx context.Context, grant DelegationGrant, scopes, projectIDs []string) (bool, error)
	ReserveAgent(ctx context.Context, clientID string, hostID, ownerID uuid.UUID) (uuid.UUID, error)
	EnrollAgent(ctx context.Context, clientID string, hostID uuid.UUID, publicKey []byte, thumbprint string, attestationID uuid.UUID) (AgentIdentity, error)
	AgentIdentity(ctx context.Context, clientID string, subjectID uuid.UUID) (AgentIdentity, error)
	RevokeAgent(ctx context.Context, clientID string, subjectID, attestationID uuid.UUID) error
	AuditPlatform(ctx context.Context, action, clientID string, subjectID, hostID, attestationID, tokenJTI *uuid.UUID, thumbprint, result string) error

	// --- Subjects ---

	GetSubject(ctx context.Context, subjectID uuid.UUID) (model.Subject, error)

	// --- Users ---

	CreateUser(ctx context.Context, userID uuid.UUID, isActive bool, username, email, passwordHash string, phone int, postInsert func(ctx context.Context, tx pgx.Tx) error) (model.User, error)
	StampEmailVerified(ctx context.Context, tx pgx.Tx, userID uuid.UUID) error
	GetUser(ctx context.Context, userID, username, email string) (model.User, error)
	UpdateUser(ctx context.Context, userID uuid.UUID, username, email, phone string) (model.User, error)
	UpdateUserPassword(ctx context.Context, userID, sessionID uuid.UUID, expectedHash, passwordHash string) error
	DeactivateUser(ctx context.Context, userID uuid.UUID) error

	// --- Auth sessions ---
	AuthenticationAttempt(ctx context.Context, bucket string, limit int, window time.Duration) (time.Duration, error)

	CreateAuthSession(ctx context.Context, sessionID uuid.UUID, subjectID, familyID uuid.UUID, refreshTokenHash, createdIP string, createdUserAgent *string, expiresAt time.Time, expectedPasswordHash string) (model.AuthSession, error)
	GetAuthSession(ctx context.Context, sessionID uuid.UUID) (model.AuthSession, error)
	ResolveBrowserSession(ctx context.Context, refreshTokenHash string) (model.BrowserSession, error)
	RefreshAuthSession(ctx context.Context, oldRefreshTokenHash string, newSessionID uuid.UUID, newRefreshTokenHash, createdIP string, createdUserAgent *string, expiresAt time.Time) (model.AuthSession, error)
	RefreshOAuthResult(ctx context.Context, oldHash, newHash, client, operation string, issue func(model.AuthSession) (string, error)) (string, error)
	RefreshOAuthSession(ctx context.Context, oldRefreshTokenHash string, newSessionID uuid.UUID, newRefreshTokenHash, createdIP string, createdUserAgent *string, expiresAt time.Time, oauthClientID string) (model.AuthSession, error)
	RevokeOAuthSessionFamily(ctx context.Context, refreshTokenHash, oauthClientID string) error
	ListAuthSessions(ctx context.Context, subjectID uuid.UUID) ([]model.AuthSession, error)
	RevokeAuthSession(ctx context.Context, sessionID, subjectID uuid.UUID, reason string, replacedBy *uuid.UUID) error
	RevokeAllAuthSessions(ctx context.Context, subjectID uuid.UUID) error

	// --- OAuth/OIDC ---

	CreateOIDCPending(ctx context.Context, request OIDCPendingRequest) error
	AuthorizeOIDC(ctx context.Context, requestID, userID, sourceSessionID uuid.UUID, authTime time.Time, codeHash []byte, now time.Time) (OIDCClientRedirect, error)
	CancelOIDC(ctx context.Context, requestID uuid.UUID, now time.Time) (OIDCClientRedirect, error)
	GetOIDCSessionAuthenticationTime(ctx context.Context, sessionID, userID uuid.UUID) (time.Time, error)
	ExchangeOIDCCode(ctx context.Context, request OIDCExchangeRequest, issue IssueOIDCTokensFunc) (OIDCTokenSet, error)
	GetOIDCActiveUser(ctx context.Context, userID uuid.UUID) (OIDCUserClaims, error)
}
