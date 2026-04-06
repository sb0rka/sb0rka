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
	RouteDatabaseList   = "/projects/{project_id}/databases"
	RouteDatabaseCreate = "/projects/{project_id}/database"
	RouteDatabaseURI    = "/projects/{project_id}/resources/{db_id}/database/uri"
)

func ListProjects(ctx context.Context, client *Client, bearer string) (contract.ProjectListResponse, error) {
	var payload contract.ProjectListResponse
	if err := client.DoJSON(ctx, "GET", RouteProjectList, bearer, nil, &payload); err != nil {
		return contract.ProjectListResponse{}, err
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
	path := routeWithDatabaseID(RouteDatabaseURI, projectID, dbID)
	return client.DoText(ctx, "GET", path, bearer)
}

func routeWithProjectID(routeTemplate string, projectID string) string {
	return strings.ReplaceAll(routeTemplate, "{project_id}", url.PathEscape(projectID))
}

func routeWithDatabaseID(routeTemplate string, projectID string, dbID string) string {
	path := routeWithProjectID(routeTemplate, projectID)
	path = strings.ReplaceAll(path, "{db_id}", url.PathEscape(dbID))
	return path
}
