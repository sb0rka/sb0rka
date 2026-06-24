package db

import (
	"context"
	"time"

	"github.com/sb0rka/sb0rka/apps/auth/internal/domain/model"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func CreateDatabase(uri string, maxConns int, connMaxLifetime int64) (Database, error) {
	return NewPsqlDB(uri, maxConns, time.Duration(connMaxLifetime))
}

type Database interface {
	TestConnection(ctx context.Context) error

	Close() error

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
	GetAuthSessionByRefreshToken(ctx context.Context, refreshTokenHash string) (model.AuthSession, error)
	RefreshAuthSession(ctx context.Context, oldRefreshTokenHash string, newSessionID uuid.UUID, newRefreshTokenHash, createdIP string, createdUserAgent *string, expiresAt time.Time) (model.AuthSession, error)
	ListAuthSessions(ctx context.Context, subjectID uuid.UUID) ([]model.AuthSession, error)
	RevokeAuthSession(ctx context.Context, sessionID, subjectID uuid.UUID, reason string, replacedBy *uuid.UUID) error
	RevokeAllAuthSessions(ctx context.Context, subjectID uuid.UUID) error

	// --- Organizations ---

	CreateOrganization(ctx context.Context, orgID uuid.UUID, name string, description *string, ownerUserID uuid.UUID) (model.Organization, error)
	GetOrganization(ctx context.Context, orgID, memberUserID uuid.UUID) (model.Organization, error)
	GetOrganizationByID(ctx context.Context, orgID uuid.UUID) (model.Organization, error)
	ListOrganizations(ctx context.Context, userID uuid.UUID) ([]model.Organization, error)
	UpdateOrganization(ctx context.Context, orgID, memberUserID uuid.UUID, name *string, description *string) (model.Organization, error)
	DeleteOrganization(ctx context.Context, orgID, memberUserID uuid.UUID) error

	// --- Organization members ---

	ListOrganizationMembers(ctx context.Context, orgID, memberUserID uuid.UUID) ([]model.OrganizationMember, error)
	AddOrganizationMember(ctx context.Context, orgID, userID, memberUserID uuid.UUID, role string) (model.OrganizationMember, error)
	GetOrganizationMember(ctx context.Context, orgID, userID, memberUserID uuid.UUID) (model.OrganizationMember, error)
	UpdateOrganizationMemberRole(ctx context.Context, orgID, userID, memberUserID uuid.UUID, role string) (model.OrganizationMember, error)
	RemoveOrganizationMember(ctx context.Context, orgID, userID, memberUserID uuid.UUID) error
}
