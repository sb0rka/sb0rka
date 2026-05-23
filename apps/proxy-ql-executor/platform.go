package main

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
)

const maxURIResponseBytes = 16 * 1024

type PlatformClient struct {
	baseURL    *url.URL
	httpClient *http.Client
}

func NewPlatformClient(baseURL string, timeout time.Duration) (*PlatformClient, error) {
	parsed, err := url.Parse(strings.TrimRight(strings.TrimSpace(baseURL), "/"))
	if err != nil {
		return nil, fmt.Errorf("parse API base URL: %w", err)
	}
	if parsed.Scheme == "" || parsed.Host == "" {
		return nil, fmt.Errorf("API base URL must include scheme and host")
	}
	return &PlatformClient{
		baseURL:    parsed,
		httpClient: &http.Client{Timeout: timeout},
	}, nil
}

func (c *PlatformClient) DatabaseURI(ctx context.Context, bearer string, projectID string, databaseID string) (string, error) {
	endpoint := c.baseURL.ResolveReference(&url.URL{
		Path: fmt.Sprintf(
			"/projects/%s/resources/%s/database/uri",
			url.PathEscape(projectID),
			url.PathEscape(databaseID),
		),
	})

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return "", NewStatusError(http.StatusInternalServerError, "Failed to create platform request", err)
	}
	req.Header.Set("Authorization", "Bearer "+bearer)
	req.Header.Set("Accept", "text/plain")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) || isTimeout(err) {
			return "", NewStatusError(http.StatusGatewayTimeout, "Platform API timed out", err)
		}
		return "", NewStatusError(http.StatusBadGateway, "Failed to reach platform API", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxURIResponseBytes))
	if err != nil {
		return "", NewStatusError(http.StatusBadGateway, "Failed to read platform response", err)
	}
	if resp.StatusCode != http.StatusOK {
		return "", NewStatusError(mapPlatformStatus(resp.StatusCode), platformErrorMessage(resp.StatusCode), nil)
	}

	uri := strings.TrimSpace(string(body))
	if uri == "" {
		return "", NewStatusError(http.StatusBadGateway, "Platform API returned empty database URI", nil)
	}
	return ensureSSLMode(uri), nil
}

func ensureSSLMode(uri string) string {
	parsed, err := url.Parse(uri)
	if err != nil {
		return uri
	}
	q := parsed.Query()
	switch strings.ToLower(q.Get("sslmode")) {
	case "require", "verify-ca", "verify-full":
		return uri
	}
	q.Set("sslmode", "require")
	parsed.RawQuery = q.Encode()
	return parsed.String()
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
