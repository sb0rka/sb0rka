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

	// Assertions
	AssertCanCreateProject(ctx context.Context, userID uuid.UUID) error
	// TODO(kompotkot): AssertCanCreateDatabase
	// TODO(kompotkot): AssertCanCreateSecret

	// Projects
	CreateProject(ctx context.Context, userID uuid.UUID, name, description string, isActive bool) (model.Project, error)
	GetProject(ctx context.Context, userID uuid.UUID, id int64) (model.Project, error)
	ListProjects(ctx context.Context, userID uuid.UUID) ([]model.Project, error)
	UpdateProject(ctx context.Context, userID uuid.UUID, id int64, name, description *string) (model.Project, error)
	DeactivateProject(ctx context.Context, userID uuid.UUID, id int64) error

	// Resources
	// Should not operate separately as a single entity.
	ListResources(ctx context.Context, userID uuid.UUID, projectID int64) ([]model.Resource, error)
	GetResource(ctx context.Context, userID uuid.UUID, projectID int64, resourceID int64) (model.Resource, error)
	DeactivateResource(ctx context.Context, userID uuid.UUID, projectID int64, resourceID int64) (model.Resource, error)

	// Databases
	CreateDatabase(ctx context.Context, userID uuid.UUID, projectID int64, name string, description *string) (model.DB, error)
	ListDatabases(ctx context.Context, userID uuid.UUID, projectID int64) ([]model.DB, error)
	GetDatabase(ctx context.Context, userID uuid.UUID, projectID int64, resourceID int64) (model.DB, error)
	UpdateDatabase(ctx context.Context, userID uuid.UUID, projectID int64, resourceID int64, name *string, description *string) (model.DB, error)

	// Database Tables
	CreateDatabaseTable(ctx context.Context, userID uuid.UUID, projectID int64, resourceID int64, name string, description *string) (model.DBTable, error)
	ListDatabaseTables(ctx context.Context, userID uuid.UUID, projectID int64, resourceID int64) ([]model.DBTable, error)
	GetDatabaseTable(ctx context.Context, userID uuid.UUID, projectID int64, resourceID int64, tableID int64) (model.DBTable, error)
	UpdateDatabaseTable(ctx context.Context, userID uuid.UUID, projectID int64, resourceID int64, tableID int64, name *string, description *string) (model.DBTable, error)
	DeleteDatabaseTable(ctx context.Context, userID uuid.UUID, projectID int64, resourceID int64, tableID int64) error

	// Database Columns
	CreateDatabaseColumn(ctx context.Context, userID uuid.UUID, projectID int64, resourceID int64, tableID int64, name string, dataType string, isPrimaryKey bool, isNullable bool, isUnique bool, isArray bool, defaultValue *string, foreignKey *string) (model.DBTableColumn, error)
	ListDatabaseColumns(ctx context.Context, userID uuid.UUID, projectID int64, resourceID int64, tableID int64) ([]model.DBTableColumn, error)
	GetDatabaseColumn(ctx context.Context, userID uuid.UUID, projectID int64, resourceID int64, tableID int64, columnID int64) (model.DBTableColumn, error)
	UpdateDatabaseColumn(ctx context.Context, userID uuid.UUID, projectID int64, resourceID int64, tableID int64, columnID int64, name string) (model.DBTableColumn, error)
	DeleteDatabaseColumn(ctx context.Context, userID uuid.UUID, projectID int64, resourceID int64, tableID int64, columnID int64) error

	// Secrets
	CreateSecret(ctx context.Context, userID uuid.UUID, projectID int64, name string, description *string, secretValueHash string) (model.Secret, error)
	ListSecrets(ctx context.Context, userID uuid.UUID, projectID int64) ([]model.Secret, error)
	RevealSecret(ctx context.Context, userID uuid.UUID, projectID int64, resourceID int64) (model.Secret, error)
	UpdateSecretValue(ctx context.Context, userID uuid.UUID, projectID int64, resourceID int64, secretValueHash string) (model.Secret, error)

	// Tags
	ListProjectTags(ctx context.Context, userID uuid.UUID, projectID int64) ([]model.Tag, error)
	ListResourceTags(ctx context.Context, userID uuid.UUID, projectID int64, resourceID int64) ([]model.Tag, error)
	AttachResourceTag(ctx context.Context, userID uuid.UUID, projectID int64, resourceID int64, tagKey string, tagValue string, color *string, is_system bool) (model.Tag, error)
	DeleteResourceTag(ctx context.Context, userID uuid.UUID, projectID int64, resourceID int64, tagID int64) error
}
