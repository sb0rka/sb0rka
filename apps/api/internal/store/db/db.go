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

	// Plans
	GetUserPlan(ctx context.Context, userID uuid.UUID) (model.Plan, error)
	ListPublicPlans(ctx context.Context) ([]model.Plan, error)
	AttachPlanByID(ctx context.Context, userID uuid.UUID, planID uuid.UUID) error
	AttachPlanByName(ctx context.Context, userID uuid.UUID, planName string) error

	// Assertions
	AssertCanCreateProject(ctx context.Context, userID uuid.UUID) error
	AssertCanCreateResourceWithType(ctx context.Context, userID uuid.UUID, projectID string, kind string) error

	// Projects
	CreateProject(ctx context.Context, userID uuid.UUID, name string, description *string, isActive bool) (model.Project, error)
	GetProject(ctx context.Context, userID uuid.UUID, id string) (model.Project, error)
	ListProjects(ctx context.Context, userID uuid.UUID) ([]model.Project, error)
	UpdateProject(ctx context.Context, userID uuid.UUID, id string, name, description *string) (model.Project, error)
	DeleteProject(ctx context.Context, userID uuid.UUID, id string) error

	// Resources
	ListResources(ctx context.Context, userID uuid.UUID, projectID string) ([]model.Resource, error)
	GetResource(ctx context.Context, userID uuid.UUID, projectID string, resourceID string) (model.Resource, error)

	// Databases
	CreateDatabase(ctx context.Context, userID uuid.UUID, projectID string, name string, normalizedName string, description *string, secretValueHash string, passwordVerifier string) (model.DB, model.Secret, error)
	ListDatabases(ctx context.Context, userID uuid.UUID, projectID string) ([]model.DB, error)
	GetDatabase(ctx context.Context, userID uuid.UUID, projectID string, resourceID string) (model.DB, error)
	UpdateDatabase(ctx context.Context, userID uuid.UUID, projectID string, resourceID string, name *string, description *string) (model.DB, error)
	GetDatabaseConnParams(ctx context.Context, userID uuid.UUID, projectID string, resourceID string) (model.DB, model.Secret, error)
	ClaimDatabaseTermination(ctx context.Context, userID uuid.UUID, projectID string, resourceID string) (model.DB, model.DBVerifier, error)

	// Secrets
	CreateSecret(ctx context.Context, userID uuid.UUID, projectID string, name string, description *string, secretValueHash string) (model.Secret, error)
	ListSecrets(ctx context.Context, userID uuid.UUID, projectID string) ([]model.Secret, error)
	GetSecret(ctx context.Context, userID uuid.UUID, projectID string, resourceID string) (model.Secret, error)
	RevealSecret(ctx context.Context, userID uuid.UUID, projectID string, resourceID string) (model.Secret, error)
	UpdateSecretValue(ctx context.Context, userID uuid.UUID, projectID string, resourceID string, secretValueHash string) (model.Secret, error)
	DeleteSecret(ctx context.Context, userID uuid.UUID, projectID string, resourceID string) error

	// Tags
	ListProjectTags(ctx context.Context, userID uuid.UUID, projectID string) ([]model.Tag, error)
	ListResourceTags(ctx context.Context, userID uuid.UUID, projectID string, resourceID string) ([]model.Tag, error)
	AttachResourceTag(ctx context.Context, userID uuid.UUID, projectID string, resourceID string, tagKey string, tagValue string, color *string, is_system bool) (model.Tag, error)
	DetachResourceTag(ctx context.Context, userID uuid.UUID, projectID string, resourceID string, tagID int64) error
}
