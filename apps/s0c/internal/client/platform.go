package client

import (
	"context"
	"fmt"
	"net/url"
	"strings"

	"github.com/sb0rka/sb0rka/packages/contract"
)

const (
	RoutePlanGet        = "/plan"
	RouteProjectList    = "/projects"
	RouteProjectCreate  = "/projects"
	RouteProjectGet     = "/projects/{project_id}"
	RouteDatabaseList   = "/projects/{project_id}/databases"
	RouteDatabaseCreate = "/projects/{project_id}/database"
	RouteDatabaseGet    = "/projects/{project_id}/resources/{resource_id}/database"
	RouteDatabaseURI    = "/projects/{project_id}/resources/{resource_id}/database/uri"
)

func ListProjects(ctx context.Context, client *Client, bearer string) (contract.ProjectListResponse, error) {
	var payload contract.ProjectListResponse
	if err := client.DoJSON(ctx, "GET", RouteProjectList, bearer, nil, &payload); err != nil {
		return contract.ProjectListResponse{}, err
	}

	return payload, nil
}

func CreateProject(ctx context.Context, client *Client, bearer string, name string, description string) (contract.ProjectResponse, error) {
	var payload contract.ProjectResponse

	name = strings.TrimSpace(name)
	if name == "" {
		return contract.ProjectResponse{}, fmt.Errorf("project name is required")
	}

	reqBody := contract.CreateProjectRequest{
		Name:        name,
		Description: strings.TrimSpace(description),
	}
	if err := client.DoJSON(ctx, "POST", RouteProjectCreate, bearer, reqBody, &payload); err != nil {
		return contract.ProjectResponse{}, err
	}

	return payload, nil
}

func GetProject(ctx context.Context, client *Client, bearer string, projectID string) (contract.ProjectResponse, error) {
	var payload contract.ProjectResponse
	path := routeWithProjectID(RouteProjectGet, projectID)
	if err := client.DoJSON(ctx, "GET", path, bearer, nil, &payload); err != nil {
		return contract.ProjectResponse{}, err
	}
	return payload, nil
}

func GetUserPlan(ctx context.Context, client *Client, bearer string) (contract.PlanResponse, error) {
	var payload contract.PlanResponse
	if err := client.DoJSON(ctx, "GET", RoutePlanGet, bearer, nil, &payload); err != nil {
		return contract.PlanResponse{}, err
	}

	return payload, nil
}

func ListDatabases(ctx context.Context, client *Client, bearer string, projectID string) (contract.DatabaseListResponse, error) {
	var payload contract.DatabaseListResponse
	if projectID == "" {
		return contract.DatabaseListResponse{}, fmt.Errorf("project ID is required")
	}

	path := routeWithProjectID(RouteDatabaseList, projectID)
	if err := client.DoJSON(ctx, "GET", path, bearer, nil, &payload); err != nil {
		return contract.DatabaseListResponse{}, err
	}

	return payload, nil
}

func CreateDatabase(
	ctx context.Context,
	client *Client,
	bearer string,
	projectID string,
	name string,
	description string,
) (contract.DatabaseWithSecretResponse, error) {
	var payload contract.DatabaseWithSecretResponse
	if projectID == "" {
		return contract.DatabaseWithSecretResponse{}, fmt.Errorf("project ID is required")
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return contract.DatabaseWithSecretResponse{}, fmt.Errorf("database name is required")
	}

	path := routeWithProjectID(RouteDatabaseCreate, projectID)

	reqBody := contract.CreateDatabaseRequest{
		Name: name,
	}
	description = strings.TrimSpace(description)
	if description != "" {
		reqBody.Description = &description
	}

	if err := client.DoJSON(ctx, "POST", path, bearer, reqBody, &payload); err != nil {
		return contract.DatabaseWithSecretResponse{}, err
	}

	return payload, nil
}

func GetDatabaseURI(ctx context.Context, client *Client, bearer string, projectID string, dbID string) (string, error) {
	path := routeWithResourceID(RouteDatabaseURI, projectID, dbID)
	return client.DoText(ctx, "GET", path, bearer)
}

func GetDatabase(ctx context.Context, client *Client, bearer string, projectID string, dbID string) (contract.DatabaseResponse, error) {
	var payload contract.DatabaseResponse
	path := routeWithResourceID(RouteDatabaseGet, projectID, dbID)
	if err := client.DoJSON(ctx, "GET", path, bearer, nil, &payload); err != nil {
		return contract.DatabaseResponse{}, err
	}
	return payload, nil
}

func routeWithProjectID(routeTemplate string, projectID string) string {
	return strings.ReplaceAll(routeTemplate, "{project_id}", url.PathEscape(projectID))
}

func routeWithResourceID(routeTemplate string, projectID string, dbID string) string {
	path := routeWithProjectID(routeTemplate, projectID)
	path = strings.ReplaceAll(path, "{resource_id}", url.PathEscape(dbID))
	return path
}
