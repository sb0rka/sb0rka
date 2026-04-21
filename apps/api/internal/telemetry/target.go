package telemetry

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/sb0rka/sb0rka/apps/api/internal/domain/model"
)

const (
	defaultPostgresPodIncludeRegex = ".*"
	defaultPostgresPodExcludeRegex = "(?i).*pgbouncer.*"
)

type PlatformReader interface {
	GetDatabase(ctx context.Context, userID uuid.UUID, projectID string, resourceID string) (model.DB, error)
}

type telemetryTarget struct {
	tenantNamespace       string
	pgBouncerDatabaseName string
	postgresPodIncludeRe  string
	postgresPodExcludeRe  string
}

func (a *prometheusInfraAdapter) resolveTarget(ctx context.Context, req AdapterQueryRequest) telemetryTarget {
	alias := strings.TrimSpace(req.DatabaseName)
	if alias == "" {
		alias = fmt.Sprintf("db_%s", req.ResourceID)
	}

	if a.platform != nil {
		database, err := a.platform.GetDatabase(ctx, req.UserID, req.ProjectID, req.ResourceID)
		if err == nil {
			alias = strings.TrimSpace(database.Name)
		}
	}

	return telemetryTarget{
		tenantNamespace:       fmt.Sprintf("tenant-%s", req.ResourceID),
		pgBouncerDatabaseName: alias,
		postgresPodIncludeRe:  defaultPostgresPodIncludeRegex,
		postgresPodExcludeRe:  defaultPostgresPodExcludeRegex,
	}
}
