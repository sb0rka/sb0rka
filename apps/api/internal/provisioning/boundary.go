package provisioning

import "context"

// Boundary represents public-repo provisioning contract.
type Boundary interface {
	EnsureDatabase(ctx context.Context, projectID, resourceID string) error
	EnsureSecret(ctx context.Context, projectID, resourceID string) error
	RemoveResource(ctx context.Context, projectID, resourceID, resourceType string) error
}
