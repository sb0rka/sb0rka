package db

import (
	"context"
	"time"

	"github.com/sb0rka/sb0rka/apps/api/internal/domain/model"

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

	// PgxPool exposes the shared pool only for extension factories. Feature
	// persistence contracts remain outside the community Database interface.
	PgxPool() *pgxpool.Pool

	// IDs
	GenerateResourceID(ctx context.Context) (uuid.UUID, error)

	// Auth/session
	GetSubjectKind(ctx context.Context, subjectID uuid.UUID) (string, error)
	IsLiveSession(ctx context.Context, sessionID uuid.UUID, subjectID uuid.UUID) (bool, error)

	// Plans
	ResolvePlanID(ctx context.Context, code, kind string) (uuid.UUID, error)
	GetSubjectPlan(ctx context.Context, subjectID uuid.UUID) (model.Plan, error)
	GetSubjectPlanByKind(ctx context.Context, subjectID uuid.UUID, kind string) (model.Plan, error)
	EnsureSubjectPlan(ctx context.Context, subjectID uuid.UUID, planCode string, kind string) error
	GetProjectPlan(ctx context.Context, projectID uuid.UUID) (model.Plan, error)
	GetPlan(ctx context.Context, planID uuid.UUID, subjectID uuid.UUID) (model.Plan, error)
	ListPublicPlans(ctx context.Context) ([]model.Plan, error)

	// Projects
	CreateProject(ctx context.Context, ownerSubjectID uuid.UUID, billingSubjectID uuid.UUID, planID uuid.UUID, name string, description *string) (model.Project, error)
	GetProject(ctx context.Context, id uuid.UUID) (model.Project, error)
	ListProjectsBySubject(ctx context.Context, subjectID uuid.UUID) ([]model.Project, error)
	UpdateProject(ctx context.Context, id uuid.UUID, name, description *string) (model.Project, error)
	DeleteProject(ctx context.Context, id uuid.UUID) error
	GetProjectMemberByPublicID(ctx context.Context, projectPublicID string, subjectID uuid.UUID) (model.ProjectMember, error)
	GetProjectMember(ctx context.Context, projectID uuid.UUID, subjectID uuid.UUID) (model.ProjectMember, error)
	ListProjectMembers(ctx context.Context, projectID uuid.UUID) ([]model.ProjectMember, error)
	AddProjectMember(ctx context.Context, projectID uuid.UUID, subjectID uuid.UUID, role string) (model.ProjectMember, error)
	UpdateProjectMemberRole(ctx context.Context, projectID uuid.UUID, subjectID uuid.UUID, role string) (model.ProjectMember, error)
	RemoveProjectMember(ctx context.Context, projectID uuid.UUID, subjectID uuid.UUID) error

	// Resources
	ListResources(ctx context.Context, projectID uuid.UUID) ([]model.Resource, error)
	GetResource(ctx context.Context, projectID uuid.UUID, resourceID uuid.UUID) (model.Resource, error)

	// Databases
	CreateDatabase(ctx context.Context, params CreateDatabaseParams) (model.DBInstance, model.Secret, model.SecretVersion, error)
	ListDatabases(ctx context.Context, projectID uuid.UUID) ([]model.DBInstance, error)
	GetDatabase(ctx context.Context, subjectID uuid.UUID, projectID uuid.UUID, resourceID uuid.UUID) (model.DBInstance, error)
	GetDatabaseByPublicID(ctx context.Context, subjectID uuid.UUID, projectID uuid.UUID, resourcePublicID string) (model.DBInstance, error)
	UpdateDatabase(ctx context.Context, projectID uuid.UUID, resourcePublicID string, name *string, description *string) (model.DBInstance, error)
	SetDatabaseDesiredRuntimeState(ctx context.Context, projectID uuid.UUID, resourcePublicID string, desiredRuntimeState string) (model.DBInstance, error)
	GetDatabaseConnParams(ctx context.Context, projectID uuid.UUID, resourcePublicID string) (model.DBInstance, model.Secret, error)
	ClaimDatabaseTermination(ctx context.Context, projectID uuid.UUID, resourcePublicID string) (model.DBInstance, model.DBInstanceVerifier, error)

	// Secrets
	CreateSecretWithInitialVersion(ctx context.Context, params CreateSecretWithInitialVersionParams) (model.Secret, model.SecretVersion, error)
	ListSecrets(ctx context.Context, projectID uuid.UUID) ([]model.Secret, error)
	GetSecret(ctx context.Context, projectID uuid.UUID, resourceID uuid.UUID) (model.Secret, error)
	GetSecretByPublicID(ctx context.Context, projectID uuid.UUID, resourcePublicID string) (model.Secret, error)
	UpdateSecretMeta(ctx context.Context, params UpdateSecretMetaParams) (model.Secret, error)
	DeleteSecret(ctx context.Context, projectID uuid.UUID, resourcePublicID string) error
	ListSecretVersions(ctx context.Context, projectID uuid.UUID, secretPublicID string) ([]model.SecretVersion, error)
	GetSecretVersion(ctx context.Context, projectID uuid.UUID, secretPublicID string, versionNo int32) (model.SecretVersion, error)
	CreateSecretVersion(ctx context.Context, params CreateSecretVersionParams) (model.SecretVersion, error)
	DisableSecretVersion(ctx context.Context, projectID uuid.UUID, secretPublicID string, versionNo int32) (model.SecretVersion, error)
	GetSecretMaterialForReveal(ctx context.Context, projectID uuid.UUID, secretID uuid.UUID, versionNo int32) (model.Secret, model.SecretVersion, model.SecretMaterial, error)
	GetSecretMaterialForRevealByPublicID(ctx context.Context, projectID uuid.UUID, resourcePublicID string, versionNo int32) (model.Secret, model.SecretVersion, model.SecretMaterial, error)
	GetActiveEncryptionKey(ctx context.Context, keyRef string) (model.EncryptionKey, error)
	GetDatabasePasswordSecretMaterial(ctx context.Context, projectID uuid.UUID, dbPublicID string) (model.DBInstance, model.Secret, model.SecretVersion, model.SecretMaterial, error)
	IsDatabasePasswordSecretByPublicID(ctx context.Context, projectID uuid.UUID, secretPublicID string) (uuid.UUID, bool, error)
	IsDatabasePasswordSecret(ctx context.Context, projectID uuid.UUID, secretID uuid.UUID) (bool, error)
	SetDatabasePasswordSecretVerifier(ctx context.Context, projectID uuid.UUID, secretID uuid.UUID, versionNo int32, passwordVerifier string) (model.DBInstanceVerifier, error)

	// Tags
	ListProjectTags(ctx context.Context, projectID uuid.UUID) ([]model.Tag, error)
	ListResourceTagsByPublicID(ctx context.Context, projectID uuid.UUID, resourcePublicID string) (uuid.UUID, []model.Tag, error)
	ListResourceTags(ctx context.Context, projectID uuid.UUID, resourceID uuid.UUID) ([]model.Tag, error)
	AttachResourceTag(ctx context.Context, projectID uuid.UUID, resourcePublicID string, tagKey string, tagValue string, color *string) (model.Tag, error)
	DetachResourceTag(ctx context.Context, projectID uuid.UUID, resourcePublicID string, tagID int64) error
}

type CreateSecretWithInitialVersionParams struct {
	PostInsert            func(ctx context.Context, tx pgx.Tx) error
	ProjectID             uuid.UUID
	SecretID              uuid.UUID
	Name                  string
	Description           *string
	PayloadKind           string
	ProtectionClass       string
	CreatedBySubjectID    uuid.UUID
	EncryptionKeyID       uuid.UUID
	CryptoProvider        string
	CryptoEnvelopeVersion string
	ContentAlgorithm      string
	AADContext            []byte
	EncryptedMessage      []byte
}

type CreateDatabaseParams struct {
	ProjectID             uuid.UUID
	DBID                  uuid.UUID
	SecretID              uuid.UUID
	Name                  string
	NormalizedName        string
	Description           *string
	PasswordVerifier      string
	ActorSubjectID        uuid.UUID
	EncryptionKeyID       uuid.UUID
	CryptoProvider        string
	CryptoEnvelopeVersion string
	ContentAlgorithm      string
	AADContext            []byte
	EncryptedMessage      []byte
}

type CreateSecretVersionParams struct {
	PostInsert            func(ctx context.Context, tx pgx.Tx) error
	ProjectID             uuid.UUID
	SecretID              uuid.UUID
	VersionNo             int32
	CreatedBySubjectID    uuid.UUID
	EncryptionKeyID       uuid.UUID
	CryptoProvider        string
	CryptoEnvelopeVersion string
	ContentAlgorithm      string
	AADContext            []byte
	EncryptedMessage      []byte
}

type UpdateSecretMetaParams struct {
	ProjectID         uuid.UUID
	ResourcePublicID  string
	Description       *string
	UpdateDescription bool
}
