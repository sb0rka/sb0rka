package app

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"github.com/sb0rka/sb0rka/apps/s0c/internal/auth"
	"github.com/sb0rka/sb0rka/apps/s0c/internal/client"
	"github.com/sb0rka/sb0rka/packages/contract"
)

type PlatformService struct {
	getenv    func(string) string
	version   string
	newClient func(baseURL string, userAgent string, opts ...client.ClientOption) *client.Client
}

func NewPlatformService(version string) *PlatformService {
	return &PlatformService{
		getenv:    nil,
		version:   version,
		newClient: client.NewClient,
	}
}

func (s *PlatformService) GetUserPlan(ctx context.Context) (contract.PlanResponse, error) {
	return runAuthorized(s, ctx, func(ctx context.Context, apiClient *client.Client, bearer string) (contract.PlanResponse, error) {
		payload, err := client.GetUserPlan(ctx, apiClient, bearer)
		if err != nil {
			return contract.PlanResponse{}, fmt.Errorf("get plan: %w", err)
		}
		return payload, nil
	})
}

func (s *PlatformService) ListProjects(ctx context.Context) (contract.ProjectListResponse, error) {
	return runAuthorized(s, ctx, func(ctx context.Context, apiClient *client.Client, bearer string) (contract.ProjectListResponse, error) {
		payload, err := client.ListProjects(ctx, apiClient, bearer)
		if err != nil {
			return contract.ProjectListResponse{}, fmt.Errorf("list projects: %w", err)
		}
		return payload, nil
	})
}

func (s *PlatformService) ListDatabases(ctx context.Context, projectID string) (contract.DatabaseListResponse, error) {
	return runAuthorized(s, ctx, func(ctx context.Context, apiClient *client.Client, bearer string) (contract.DatabaseListResponse, error) {
		payload, err := client.ListDatabases(ctx, apiClient, bearer, projectID)
		if err != nil {
			return contract.DatabaseListResponse{}, fmt.Errorf("list databases: %w", err)
		}
		return payload, nil
	})
}

func (s *PlatformService) CreateDatabase(ctx context.Context, projectID string, name string, description string) (contract.DatabaseWithSecretResponse, error) {
	return runAuthorized(s, ctx, func(ctx context.Context, apiClient *client.Client, bearer string) (contract.DatabaseWithSecretResponse, error) {
		payload, err := client.CreateDatabase(ctx, apiClient, bearer, projectID, name, description)
		if err != nil {
			return contract.DatabaseWithSecretResponse{}, fmt.Errorf("create database: %w", err)
		}
		return payload, nil
	})
}

func (s *PlatformService) GetDatabaseURI(ctx context.Context, projectID string, databaseID string) (string, error) {
	return runAuthorized(s, ctx, func(ctx context.Context, apiClient *client.Client, bearer string) (string, error) {
		uri, err := client.GetDatabaseURI(ctx, apiClient, bearer, projectID, databaseID)
		if err != nil {
			return "", fmt.Errorf("get database URI: %w", err)
		}
		return uri, nil
	})
}

func runAuthorized[T any](
	s *PlatformService,
	ctx context.Context,
	do func(ctx context.Context, apiClient *client.Client, bearer string) (T, error),
) (T, error) {
	var zero T

	apiBaseURL, authBaseURL, err := ResolveBaseURLs(s.getenv)
	if err != nil {
		return zero, err
	}

	userAgent := fmt.Sprintf("s0c/%s", s.version)
	apiClient := s.newClient(apiBaseURL, userAgent)
	authClient := s.newClient(authBaseURL, userAgent)

	bearer, err := auth.GetValidAccessToken(ctx, authClient)
	if err != nil {
		return zero, err
	}

	v, err := do(ctx, apiClient, bearer)
	if err != nil {
		var httpErr *client.HTTPError
		if errors.As(err, &httpErr) && httpErr.StatusCode == http.StatusUnauthorized {
			bearer, refreshErr := auth.ForceRefreshAccessToken(ctx, authClient)
			if refreshErr != nil {
				return zero, refreshErr
			}
			v, err = do(ctx, apiClient, bearer)
		}
	}
	if err != nil {
		return zero, err
	}

	return v, nil
}
