package client

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/sb0rka/sb0rka/packages/contract"
)

const (
	RouteAuthSessionRefresh = "/auth/refresh"
)

// TODO(kompotkot): Refactor this

func (c *Client) RefreshSession(ctx context.Context, refreshToken string) (string, string, *time.Time, error) {
	respBody, httpResp, err := c.doRequest(ctx, http.MethodPost, RouteAuthSessionRefresh, bytes.NewBufferString("{}"), requestOptions{
		accept:      "application/json",
		contentType: "application/json",
		// TODO(kompotkot): Params from config
		cookies: []*http.Cookie{
			{
				Name:  "refresh_token",
				Value: refreshToken,
				Path:  "/",
			},
		},
	})
	if err != nil {
		return "", "", nil, err
	}

	var payload contract.RefreshSessionResponse
	if err := json.Unmarshal(respBody, &payload); err != nil {
		return "", "", nil, fmt.Errorf("decode refresh response: %w", err)
	}

	expiresAt, err := parseExpiry(payload)
	if err != nil {
		return "", "", nil, err
	}

	nextRefreshToken := strings.TrimSpace(payload.RefreshToken)
	for _, cookie := range httpResp.Cookies() {
		if cookie.Name == "refresh_token" && cookie.Value != "" {
			nextRefreshToken = cookie.Value
			break
		}
	}

	return payload.AccessToken, nextRefreshToken, expiresAt, nil
}

func parseExpiry(resp contract.RefreshSessionResponse) (*time.Time, error) {
	if resp.ExpiresIn > 0 {
		t := time.Now().Add(time.Duration(resp.ExpiresIn) * time.Second)
		return &t, nil
	}

	raw := strings.TrimSpace(resp.ExpiresAt)
	if raw == "" {
		return parseJWTAccessExp(resp.AccessToken)
	}

	t, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		return nil, fmt.Errorf("invalid expires_at: %w", err)
	}
	return &t, nil
}

func parseJWTAccessExp(accessToken string) (*time.Time, error) {
	parts := strings.Split(accessToken, ".")
	if len(parts) < 2 {
		return nil, fmt.Errorf("refresh response missing expires_in/expires_at and token is not JWT")
	}

	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("decode jwt payload: %w", err)
	}

	var claims struct {
		Exp int64 `json:"exp"`
	}
	if err := json.Unmarshal(payload, &claims); err != nil {
		return nil, fmt.Errorf("decode jwt claims: %w", err)
	}
	if claims.Exp <= 0 {
		return nil, fmt.Errorf("refresh response missing expires_in/expires_at and jwt exp claim")
	}

	t := time.Unix(claims.Exp, 0).UTC()
	return &t, nil
}
