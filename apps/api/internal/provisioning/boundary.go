package provisioning

import "context"

// Boundary represents public-repo provisioning contract.
type Boundary interface {
	EnsureDatabase(ctx context.Context, projectID int64, resourceID int64) error
	EnsureSecret(ctx context.Context, projectID int64, resourceID int64) error
	RemoveResource(ctx context.Context, projectID int64, resourceID int64, resourceType string) error
}
