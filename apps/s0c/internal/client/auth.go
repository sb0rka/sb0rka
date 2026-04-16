package client

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/mail"
	"net/url"
	"strings"
	"time"

	"github.com/sb0rka/sb0rka/packages/contract"
)

const (
	RouteAuthLogin          = "/auth/login"
	RouteAuthLogout         = "/auth/logout"
	RouteAuthSessionRefresh = "/auth/refresh"
)

type LoginResponse struct {
	AccessToken string `json:"access_token"`
}

func (c *Client) Login(ctx context.Context, usernameOrEmail string, password string) (string, string, *time.Time, error) {
	usernameOrEmail = strings.TrimSpace(usernameOrEmail)
	if usernameOrEmail == "" {
		return "", "", nil, fmt.Errorf("username or email is required")
	}
	password = strings.TrimSpace(password)
	if password == "" {
		return "", "", nil, fmt.Errorf("password is required")
	}

	form := url.Values{}
	if looksLikeEmail(usernameOrEmail) {
		form.Set("email", usernameOrEmail)
	} else {
		form.Set("username", usernameOrEmail)
	}
	form.Set("password", password)

	respBody, httpResp, err := c.doRequest(
		ctx,
		http.MethodPost,
		RouteAuthLogin,
		strings.NewReader(form.Encode()),
		requestOptions{
			accept:      "application/json",
			contentType: "application/x-www-form-urlencoded",
		},
	)
	if err != nil {
		return "", "", nil, err
	}

	var payload LoginResponse
	if err := json.Unmarshal(respBody, &payload); err != nil {
		return "", "", nil, fmt.Errorf("decode login response: %w", err)
	}

	access := strings.TrimSpace(payload.AccessToken)
	if access == "" {
		return "", "", nil, fmt.Errorf("login response did not return access token")
	}

	refreshToken := readRefreshTokenFromCookies(httpResp, c.refreshTokenCookieName)
	if refreshToken == "" {
		return "", "", nil, fmt.Errorf("login response did not include refresh token cookie %q", c.refreshTokenCookieName)
	}

	expiresAt, err := parseJWTAccessExp(access)
	if err != nil {
		return "", "", nil, err
	}

	return access, refreshToken, expiresAt, nil
}

func (c *Client) Logout(ctx context.Context, bearer string) error {
	_, _, err := c.doRequest(ctx, http.MethodPost, RouteAuthLogout, nil, requestOptions{
		accept: "*/*",
		bearer: bearer,
	})
	return err
}

// TODO(kompotkot): Refactor this

func (c *Client) RefreshSession(ctx context.Context, refreshToken string) (string, string, *time.Time, error) {
	respBody, httpResp, err := c.doRequest(ctx, http.MethodPost, RouteAuthSessionRefresh, bytes.NewBufferString("{}"), requestOptions{
		accept:      "application/json",
		contentType: "application/json",
		cookies: []*http.Cookie{
			{
				Name:  c.refreshTokenCookieName,
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

	nextRefreshToken := readRefreshTokenFromCookies(httpResp, c.refreshTokenCookieName)
	if nextRefreshToken == "" {
		nextRefreshToken = strings.TrimSpace(payload.RefreshToken)
	}

	return payload.AccessToken, nextRefreshToken, expiresAt, nil
}

func readRefreshTokenFromCookies(httpResp *http.Response, cookieName string) string {
	for _, cookie := range httpResp.Cookies() {
		if cookie.Name == cookieName && cookie.Value != "" {
			return cookie.Value
		}
	}
	return ""
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

func looksLikeEmail(v string) bool {
	_, err := mail.ParseAddress(v)
	return err == nil
}
