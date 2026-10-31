package db

import (
	"context"
	"time"

	"github.com/sb0rka/sb0rka/apps/auth/internal/domain/model"

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

	// --- Subjects ---

	GetSubject(ctx context.Context, subjectID uuid.UUID) (model.Subject, error)

	// --- Users ---

	CreateUser(ctx context.Context, userID uuid.UUID, isActive bool, username, email, passwordHash string, phone int, postInsert func(ctx context.Context, tx pgx.Tx) error) (model.User, error)
	GetUser(ctx context.Context, userID, username, email string) (model.User, error)
	UpdateUser(ctx context.Context, userID uuid.UUID, username, email, phone string) (model.User, error)
	UpdateUserPassword(ctx context.Context, userID uuid.UUID, passwordHash string) error
	DeactivateUser(ctx context.Context, userID uuid.UUID) error

	// --- Auth sessions ---

	CreateAuthSession(ctx context.Context, sessionID uuid.UUID, subjectID, familyID uuid.UUID, refreshTokenHash, createdIP string, createdUserAgent *string, expiresAt time.Time) (model.AuthSession, error)
	GetAuthSession(ctx context.Context, sessionID uuid.UUID) (model.AuthSession, error)
	ResolveBrowserSession(ctx context.Context, refreshTokenHash string) (model.BrowserSession, error)
	RefreshAuthSession(ctx context.Context, oldRefreshTokenHash string, newSessionID uuid.UUID, newRefreshTokenHash, createdIP string, createdUserAgent *string, expiresAt time.Time) (model.AuthSession, error)
	RefreshOAuthSession(ctx context.Context, oldRefreshTokenHash string, newSessionID uuid.UUID, newRefreshTokenHash, createdIP string, createdUserAgent *string, expiresAt time.Time, oauthClientID string) (model.AuthSession, error)
	RevokeOAuthSessionFamily(ctx context.Context, refreshTokenHash, oauthClientID string) error
	ListAuthSessions(ctx context.Context, subjectID uuid.UUID) ([]model.AuthSession, error)
	RevokeAuthSession(ctx context.Context, sessionID, subjectID uuid.UUID, reason string, replacedBy *uuid.UUID) error
	RevokeAllAuthSessions(ctx context.Context, subjectID uuid.UUID) error

	// --- OAuth/OIDC ---

	CreateOIDCPending(ctx context.Context, request OIDCPendingRequest) error
	AuthorizeOIDC(ctx context.Context, requestID, userID uuid.UUID, authTime time.Time, codeHash []byte, now time.Time) (OIDCClientRedirect, error)
	CancelOIDC(ctx context.Context, requestID uuid.UUID, now time.Time) (OIDCClientRedirect, error)
	GetOIDCSessionAuthenticationTime(ctx context.Context, sessionID, userID uuid.UUID) (time.Time, error)
	ExchangeOIDCCode(ctx context.Context, request OIDCExchangeRequest, issue IssueOIDCTokensFunc) (OIDCTokenSet, error)
	GetOIDCActiveUser(ctx context.Context, userID uuid.UUID) (OIDCUserClaims, error)
}
