package db

import (
	"context"
	"time"

	"github.com/sb0rka/sb0rka/apps/api/internal/domain/model"

	"github.com/google/uuid"
)

func CreateDatabase(uri string, maxConns int, connMaxLifetime int64) (Database, error) {
	return NewPsqlDB(uri, maxConns, time.Duration(connMaxLifetime))
}

type Database interface {
	TestConnection(ctx context.Context) error

	Close() error

	// IDs
	GenerateResourceID(ctx context.Context) (string, error)

	// Auth/session
	GetSubjectKind(ctx context.Context, subjectID uuid.UUID) (string, error)
	IsLiveSession(ctx context.Context, sessionID uuid.UUID, subjectID uuid.UUID) (bool, error)

	// Plans
	GetSubjectPlan(ctx context.Context, subjectID uuid.UUID) (model.Plan, error)
	GetSubjectPlanByKind(ctx context.Context, subjectID uuid.UUID, kind string) (model.Plan, error)
	EnsureSubjectPlan(ctx context.Context, subjectID uuid.UUID, planCode string, kind string) error
	GetProjectPlan(ctx context.Context, projectID string) (model.Plan, error)
	ListPublicPlans(ctx context.Context) ([]model.Plan, error)
	ListProjectQuotas(ctx context.Context, projectID string) ([]model.ProjectQuota, error)
	ListProjectUsage(ctx context.Context, projectID string) (map[string]int64, error)

	// Assertions
	AssertCanCreateProject(ctx context.Context, billingSubjectID uuid.UUID, planID *uuid.UUID) error
	AssertCanCreateResourceWithType(ctx context.Context, billingSubjectID uuid.UUID, projectID string, kind string) error

	// Projects
	CreateProject(ctx context.Context, ownerSubjectID uuid.UUID, billingSubjectID uuid.UUID, name string, description *string) (model.Project, error)
	GetProject(ctx context.Context, id string) (model.Project, error)
	ListProjectsBySubject(ctx context.Context, subjectID uuid.UUID) ([]model.Project, error)
	UpdateProject(ctx context.Context, id string, name, description *string) (model.Project, error)
	DeleteProject(ctx context.Context, id string) error
	GetProjectMember(ctx context.Context, projectID string, subjectID uuid.UUID) (model.ProjectMember, error)
	ListProjectMembers(ctx context.Context, projectID string) ([]model.ProjectMember, error)
	AddProjectMember(ctx context.Context, projectID string, subjectID uuid.UUID, role string) (model.ProjectMember, error)
	UpdateProjectMemberRole(ctx context.Context, projectID string, subjectID uuid.UUID, role string) (model.ProjectMember, error)
	RemoveProjectMember(ctx context.Context, projectID string, subjectID uuid.UUID) error

	// Resources
	ListResources(ctx context.Context, projectID string) ([]model.Resource, error)
	GetResource(ctx context.Context, projectID string, resourceID string) (model.Resource, error)

	// Databases
	CreateDatabase(ctx context.Context, params CreateDatabaseParams) (model.DBInstance, model.Secret, model.SecretVersion, error)
	ListDatabases(ctx context.Context, projectID string) ([]model.DBInstance, error)
	GetDatabase(ctx context.Context, subjectID uuid.UUID, projectID string, resourceID string) (model.DBInstance, error)
	UpdateDatabase(ctx context.Context, projectID string, resourceID string, name *string, description *string) (model.DBInstance, error)
	SetDatabaseDesiredRuntimeState(ctx context.Context, projectID string, resourceID string, desiredRuntimeState string) (model.DBInstance, error)
	GetDatabaseConnParams(ctx context.Context, projectID string, resourceID string) (model.DBInstance, model.Secret, error)
	ClaimDatabaseTermination(ctx context.Context, projectID string, resourceID string) (model.DBInstance, model.DBInstanceVerifier, error)

	// Secrets
	CreateSecretWithInitialVersion(ctx context.Context, params CreateSecretWithInitialVersionParams) (model.Secret, model.SecretVersion, error)
	ListSecrets(ctx context.Context, projectID string) ([]model.Secret, error)
	GetSecret(ctx context.Context, projectID string, resourceID string) (model.Secret, error)
	UpdateSecretMeta(ctx context.Context, projectID string, resourceID string, description *string) (model.Secret, error)
	DeleteSecret(ctx context.Context, projectID string, resourceID string) error
	ListSecretVersions(ctx context.Context, projectID string, secretID string) ([]model.SecretVersion, error)
	GetSecretVersion(ctx context.Context, projectID string, secretID string, versionNo int) (model.SecretVersion, error)
	CreateSecretVersion(ctx context.Context, params CreateSecretVersionParams) (model.SecretVersion, error)
	DisableSecretVersion(ctx context.Context, projectID string, secretID string, versionNo int) (model.SecretVersion, error)
	GetSecretMaterialForReveal(ctx context.Context, projectID string, secretID string, versionNo int) (model.Secret, model.SecretVersion, model.SecretMaterial, error)
	GetActiveEncryptionKey(ctx context.Context) (model.EncryptionKey, error)
	GetDatabasePasswordSecretMaterial(ctx context.Context, projectID string, dbID string) (model.DBInstance, model.Secret, model.SecretVersion, model.SecretMaterial, error)
	IsDatabasePasswordSecret(ctx context.Context, projectID string, secretID string) (bool, error)
	SetDatabasePasswordSecretVerifier(ctx context.Context, projectID string, secretID string, versionNo int, passwordVerifier string) (model.DBInstanceVerifier, error)

	// Tags
	ListProjectTags(ctx context.Context, projectID string) ([]model.Tag, error)
	ListResourceTags(ctx context.Context, projectID string, resourceID string) ([]model.Tag, error)
	AttachResourceTag(ctx context.Context, projectID string, resourceID string, tagKey string, tagValue string, color *string) (model.Tag, error)
	DetachResourceTag(ctx context.Context, projectID string, resourceID string, tagID int64) error
}

type CreateSecretWithInitialVersionParams struct {
	ProjectID             string
	SecretID              string
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
	ProjectID             string
	DBID                  string
	SecretID              string
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
	ProjectID             string
	SecretID              string
	VersionNo             int
	PayloadKind           string
	CreatedBySubjectID    uuid.UUID
	EncryptionKeyID       uuid.UUID
	CryptoProvider        string
	CryptoEnvelopeVersion string
	ContentAlgorithm      string
	AADContext            []byte
	EncryptedMessage      []byte
}
