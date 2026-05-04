package platform

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/sb0rka/sb0rka/apps/query-runner/internal/runner"
)

const maxURIResponseBytes = 16 * 1024

type Client struct {
	baseURL    *url.URL
	httpClient *http.Client
}

func NewClient(baseURL string, timeout time.Duration) (*Client, error) {
	parsed, err := url.Parse(strings.TrimRight(strings.TrimSpace(baseURL), "/"))
	if err != nil {
		return nil, fmt.Errorf("parse platform base URL: %w", err)
	}
	if parsed.Scheme == "" || parsed.Host == "" {
		return nil, fmt.Errorf("platform base URL must include scheme and host")
	}
	return &Client{
		baseURL:    parsed,
		httpClient: &http.Client{Timeout: timeout},
	}, nil
}

func (c *Client) DatabaseURI(ctx context.Context, bearer string, projectID string, databaseID string) (string, error) {
	endpoint := c.baseURL.ResolveReference(&url.URL{
		Path: fmt.Sprintf(
			"/projects/%s/resources/%s/database/uri",
			url.PathEscape(projectID),
			url.PathEscape(databaseID),
		),
	})

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return "", runner.NewStatusError(http.StatusInternalServerError, "Failed to create platform request", err)
	}
	req.Header.Set("Authorization", "Bearer "+bearer)
	req.Header.Set("Accept", "text/plain")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) || isTimeout(err) {
			return "", runner.NewStatusError(http.StatusGatewayTimeout, "Platform API timed out", err)
		}
		return "", runner.NewStatusError(http.StatusBadGateway, "Failed to reach platform API", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxURIResponseBytes))
	if err != nil {
		return "", runner.NewStatusError(http.StatusBadGateway, "Failed to read platform response", err)
	}
	if resp.StatusCode != http.StatusOK {
		return "", runner.NewStatusError(mapPlatformStatus(resp.StatusCode), platformErrorMessage(resp.StatusCode), nil)
	}

	uri := strings.TrimSpace(string(body))
	if uri == "" {
		return "", runner.NewStatusError(http.StatusBadGateway, "Platform API returned empty database URI", nil)
	}
	return uri, nil
}

func isTimeout(err error) bool {
	var netErr net.Error
	return errors.As(err, &netErr) && netErr.Timeout()
}

func mapPlatformStatus(statusCode int) int {
	switch statusCode {
	case http.StatusUnauthorized:
		return http.StatusUnauthorized
	case http.StatusForbidden:
		return http.StatusForbidden
	case http.StatusNotFound:
		return http.StatusNotFound
	case http.StatusConflict:
		return http.StatusConflict
	case http.StatusRequestTimeout:
		return http.StatusGatewayTimeout
	default:
		if statusCode >= 500 {
			return http.StatusBadGateway
		}
		return http.StatusBadGateway
	}
}

func platformErrorMessage(statusCode int) string {
	switch statusCode {
	case http.StatusUnauthorized:
		return "Unauthorized"
	case http.StatusForbidden:
		return "Forbidden"
	case http.StatusNotFound:
		return "Database not found"
	case http.StatusConflict:
		return "Database connection is ambiguous"
	default:
		return "Platform API failed to resolve database URI"
	}
}
