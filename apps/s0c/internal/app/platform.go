package app

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/sb0rka/sb0rka/apps/s0c/internal/auth"
	"github.com/sb0rka/sb0rka/apps/s0c/internal/client"
	"github.com/sb0rka/sb0rka/packages/contract"
	"golang.org/x/term"
)

type PlatformService struct {
	getenv            func(string) string
	version           string
	newClient         func(baseURL string, userAgent string, opts ...client.ClientOption) *client.Client
	promptCredentials func() (string, string, error)
}

func NewPlatformService(version string) *PlatformService {
	return &PlatformService{
		getenv:            nil,
		version:           version,
		newClient:         client.NewClient,
		promptCredentials: promptLoginCredentials,
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

func (s *PlatformService) CreateProject(ctx context.Context, name string, description string) (contract.ProjectResponse, error) {
	return runAuthorized(s, ctx, func(ctx context.Context, apiClient *client.Client, bearer string) (contract.ProjectResponse, error) {
		payload, err := client.CreateProject(ctx, apiClient, bearer, name, description)
		if err != nil {
			return contract.ProjectResponse{}, fmt.Errorf("create project: %w", err)
		}
		return payload, nil
	})
}

func (s *PlatformService) GetProject(ctx context.Context, projectID string) (contract.ProjectResponse, error) {
	return runAuthorized(s, ctx, func(ctx context.Context, apiClient *client.Client, bearer string) (contract.ProjectResponse, error) {
		payload, err := client.GetProject(ctx, apiClient, bearer, projectID)
		if err != nil {
			return contract.ProjectResponse{}, fmt.Errorf("get project: %w", err)
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

func (s *PlatformService) GetDatabase(ctx context.Context, projectID string, databaseID string) (contract.DatabaseResponse, error) {
	return runAuthorized(s, ctx, func(ctx context.Context, apiClient *client.Client, bearer string) (contract.DatabaseResponse, error) {
		payload, err := client.GetDatabase(ctx, apiClient, bearer, projectID, databaseID)
		if err != nil {
			return contract.DatabaseResponse{}, fmt.Errorf("get database: %w", err)
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

	apiBaseURL, authBaseURL := ResolveBaseURLs(s.getenv)
	refreshCookieName := ResolveRefreshTokenCookieName(s.getenv)

	userAgent := fmt.Sprintf("s0c/%s", s.version)
	apiClient := s.newClient(apiBaseURL, userAgent)
	authClient := s.newClient(authBaseURL, userAgent, client.WithRefreshTokenCookieName(refreshCookieName))

	bearer, err := getOrLoginAccessToken(ctx, s, authClient)
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

func getOrLoginAccessToken(ctx context.Context, s *PlatformService, authClient *client.Client) (string, error) {
	bearer, err := auth.GetValidAccessToken(ctx, authClient)
	if err == nil {
		return bearer, nil
	}
	if !errors.Is(err, auth.ErrAuthNotConfigured) && !errors.Is(err, auth.ErrRefreshTokenMissing) {
		return "", err
	}

	usernameOrEmail, password, promptErr := s.promptCredentials()
	if promptErr != nil {
		return "", promptErr
	}

	accessToken, refreshToken, expiresAt, loginErr := authClient.Login(ctx, usernameOrEmail, password)
	if loginErr != nil {
		return "", fmt.Errorf("login failed: %w", loginErr)
	}

	state := auth.AuthState{
		RefreshToken: refreshToken,
		AccessToken:  accessToken,
	}
	if expiresAt != nil && !expiresAt.IsZero() {
		normalized := expiresAt.UTC()
		state.AccessTokenExpiresAt = &normalized
	}
	if err := auth.SaveState(state); err != nil {
		return "", fmt.Errorf("save auth state: %w", err)
	}

	return accessToken, nil
}

func promptLoginCredentials() (string, string, error) {
	if !term.IsTerminal(int(os.Stdin.Fd())) {
		return "", "", fmt.Errorf("auth is not configured, run 's0c auth login' in an interactive terminal")
	}

	_, err := fmt.Fprint(os.Stderr, "Username or email: ")
	if err != nil {
		return "", "", err
	}
	reader := bufio.NewReader(os.Stdin)
	usernameOrEmailRaw, err := reader.ReadString('\n')
	if err != nil {
		return "", "", fmt.Errorf("read username or email: %w", err)
	}
	usernameOrEmail := strings.TrimSpace(usernameOrEmailRaw)
	if usernameOrEmail == "" {
		return "", "", fmt.Errorf("username or email cannot be empty")
	}

	_, err = fmt.Fprint(os.Stderr, "Password: ")
	if err != nil {
		return "", "", err
	}
	passwordBytes, err := term.ReadPassword(int(os.Stdin.Fd()))
	if err != nil {
		return "", "", fmt.Errorf("read password: %w", err)
	}
	_, _ = fmt.Fprintln(os.Stderr)

	password := strings.TrimSpace(string(passwordBytes))
	if password == "" {
		return "", "", fmt.Errorf("password cannot be empty")
	}

	return usernameOrEmail, password, nil
}
