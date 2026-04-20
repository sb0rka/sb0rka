package client

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const defaultHTTPTimeout = 15 * time.Second

type Client struct {
	baseURL                string
	userAgent              string
	httpClient             *http.Client
	refreshTokenCookieName string
}

type ClientOption func(*Client)

func WithHTTPClient(httpClient *http.Client) ClientOption {
	return func(c *Client) {
		if httpClient != nil {
			c.httpClient = httpClient
		}
	}
}

func WithTimeout(timeout time.Duration) ClientOption {
	return func(c *Client) {
		if timeout > 0 {
			c.httpClient.Timeout = timeout
		}
	}
}

func WithRefreshTokenCookieName(cookieName string) ClientOption {
	return func(c *Client) {
		cookieName = strings.TrimSpace(cookieName)
		if cookieName != "" {
			c.refreshTokenCookieName = cookieName
		}
	}
}

type HTTPError struct {
	StatusCode int
	Body       string
}

func (e *HTTPError) Error() string {
	return fmt.Sprintf("request failed: status=%d body=%s", e.StatusCode, e.Body)
}

func NewClient(baseURL string, userAgent string, opts ...ClientOption) *Client {
	client := &Client{
		baseURL:                strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		userAgent:              strings.TrimSpace(userAgent),
		refreshTokenCookieName: "__Secure-refresh_token",
		httpClient: &http.Client{
			Timeout: defaultHTTPTimeout,
		},
	}

	for _, opt := range opts {
		opt(client)
	}

	return client
}

type requestOptions struct {
	accept      string
	contentType string
	bearer      string
	cookies     []*http.Cookie
}

func (c *Client) doRequest(
	ctx context.Context,
	method string,
	path string,
	body io.Reader,
	opts requestOptions,
) ([]byte, *http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, body)
	if err != nil {
		return nil, nil, fmt.Errorf("build request: %w", err)
	}

	if opts.accept != "" {
		req.Header.Set("Accept", opts.accept)
	}
	if opts.contentType != "" {
		req.Header.Set("Content-Type", opts.contentType)
	}
	if c.userAgent != "" {
		req.Header.Set("User-Agent", c.userAgent)
	}
	if strings.TrimSpace(opts.bearer) != "" {
		req.Header.Set("Authorization", "Bearer "+opts.bearer)
	}
	for _, cookie := range opts.cookies {
		req.AddCookie(cookie)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, nil, fmt.Errorf("execute request: %w", err)
	}
	defer resp.Body.Close()

	respData, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, nil, fmt.Errorf("read response body: %w", err)
	}

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, resp, &HTTPError{
			StatusCode: resp.StatusCode,
			Body:       strings.TrimSpace(string(respData)),
		}
	}

	return respData, resp, nil
}

func (c *Client) DoJSON(
	ctx context.Context,
	method string,
	path string,
	bearer string,
	reqBody any,
	respBody any,
) error {
	var bodyReader io.Reader
	if reqBody != nil {
		raw, err := json.Marshal(reqBody)
		if err != nil {
			return fmt.Errorf("encode request body: %w", err)
		}
		bodyReader = bytes.NewReader(raw)
	}

	respData, _, err := c.doRequest(ctx, method, path, bodyReader, requestOptions{
		accept:      "application/json",
		contentType: contentTypeForJSON(reqBody),
		bearer:      bearer,
	})
	if err != nil {
		return err
	}

	if respBody == nil || len(respData) == 0 {
		return nil
	}

	if err := json.Unmarshal(respData, respBody); err != nil {
		return fmt.Errorf("decode response body: %w", err)
	}

	return nil
}

func (c *Client) DoText(ctx context.Context, method, path, bearer string) (string, error) {
	respData, _, err := c.doRequest(ctx, method, path, nil, requestOptions{
		accept: "*/*",
		bearer: bearer,
	})
	if err != nil {
		return "", err
	}

	return strings.TrimSpace(string(respData)), nil
}

func contentTypeForJSON(reqBody any) string {
	if reqBody == nil {
		return ""
	}
	return "application/json"
}
