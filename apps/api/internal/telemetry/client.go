package telemetry

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type PrometheusClient interface {
	QueryRange(ctx context.Context, query string, rng TimeRange) ([]prometheusMatrixSeries, error)
}

type promAuth struct {
	username    string
	password    string
	bearerToken string
}

type prometheusMatrixSeries struct {
	Metric map[string]string `json:"metric"`
	Values [][]any           `json:"values"`
}

type prometheusQueryRangeResponse struct {
	Status    string `json:"status"`
	ErrorType string `json:"errorType"`
	Error     string `json:"error"`
	Data      struct {
		ResultType string                   `json:"resultType"`
		Result     []prometheusMatrixSeries `json:"result"`
	} `json:"data"`
}

type httpPrometheusClient struct {
	queryRangeEndpoint string
	client             *http.Client
	auth               promAuth
}

func newHTTPPrometheusClient(baseURI string, client *http.Client, auth promAuth) (PrometheusClient, error) {
	parsed, err := url.Parse(strings.TrimSpace(baseURI))
	if err != nil {
		return nil, fmt.Errorf("parse prometheus uri: %w", err)
	}
	if parsed.Scheme == "" || parsed.Host == "" {
		return nil, fmt.Errorf("prometheus uri must include scheme and host")
	}

	if auth.bearerToken == "" && auth.username == "" && parsed.User != nil {
		auth.username = parsed.User.Username()
		if pwd, ok := parsed.User.Password(); ok {
			auth.password = pwd
		}
	}
	parsed.User = nil

	return &httpPrometheusClient{
		queryRangeEndpoint: strings.TrimRight(parsed.String(), "/") + "/api/v1/query_range",
		client:             client,
		auth:               auth,
	}, nil
}

func (c *httpPrometheusClient) QueryRange(ctx context.Context, query string, rng TimeRange) ([]prometheusMatrixSeries, error) {
	uri, err := url.Parse(c.queryRangeEndpoint)
	if err != nil {
		return nil, fmt.Errorf("parse query_range endpoint: %w", err)
	}

	values := url.Values{}
	values.Set("query", query)
	values.Set("start", strconv.FormatInt(rng.From.Unix(), 10))
	values.Set("end", strconv.FormatInt(rng.To.Unix(), 10))
	values.Set("step", strconv.FormatInt(int64(rng.Step/time.Second), 10))
	uri.RawQuery = values.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, uri.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("build query_range request: %w", err)
	}
	if c.auth.bearerToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.auth.bearerToken)
	} else if c.auth.username != "" || c.auth.password != "" {
		req.SetBasicAuth(c.auth.username, c.auth.password)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return nil, ErrUpstreamTimeout
		}
		return nil, fmt.Errorf("%w: %v", ErrUpstream, err)
	}
	defer resp.Body.Close()

	rawBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("%w: read response body: %v", ErrUpstream, err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%w: status=%d body=%s", ErrUpstream, resp.StatusCode, shrinkBody(rawBody))
	}

	var payload prometheusQueryRangeResponse
	dec := json.NewDecoder(strings.NewReader(string(rawBody)))
	dec.UseNumber()
	if err := dec.Decode(&payload); err != nil {
		return nil, fmt.Errorf("%w: decode response: %v", ErrUpstream, err)
	}

	if payload.Status != "success" {
		if payload.Error != "" {
			return nil, fmt.Errorf("%w: %s", ErrUpstream, payload.Error)
		}
		return nil, fmt.Errorf("%w: non-success status %q", ErrUpstream, payload.Status)
	}

	if payload.Data.ResultType != "matrix" {
		return nil, fmt.Errorf("%w: expected resultType=matrix got %q", ErrUpstream, payload.Data.ResultType)
	}

	return payload.Data.Result, nil
}

func shrinkBody(body []byte) string {
	const limit = 512
	if len(body) <= limit {
		return strings.TrimSpace(string(body))
	}
	return strings.TrimSpace(string(body[:limit])) + "..."
}
