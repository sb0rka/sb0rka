package telemetry

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"
)

type AdapterConfig struct {
	PrometheusURI          string
	PrometheusQueryTimeout time.Duration
	PrometheusUsername     string
	PrometheusPassword     string
	PrometheusBearerToken  string
	HTTPClient             *http.Client
}

type prometheusInfraAdapter struct {
	platform       PlatformReader
	prom           PrometheusClient
	clusterLabel   string
	requestTimeout time.Duration
}

func NewPrometheusInfraAdapter(platform PlatformReader, cfg AdapterConfig) (InfraAdapter, error) {
	client := cfg.HTTPClient
	if client == nil {
		client = http.DefaultClient
	}

	promClient, err := newHTTPPrometheusClient(cfg.PrometheusURI, client, promAuth{
		username:    cfg.PrometheusUsername,
		password:    cfg.PrometheusPassword,
		bearerToken: cfg.PrometheusBearerToken,
	})
	if err != nil {
		return nil, err
	}

	timeout := cfg.PrometheusQueryTimeout
	if timeout <= 0 {
		timeout = 10 * time.Second
	}

	return &prometheusInfraAdapter{
		platform:       platform,
		prom:           promClient,
		requestTimeout: timeout,
	}, nil
}

func (a *prometheusInfraAdapter) QueryResourceMetric(ctx context.Context, req AdapterQueryRequest) (AdapterQueryResult, error) {
	target := a.resolveTarget(ctx, req)

	query, err := buildPromQL(req.Metric, target, a.clusterLabel)
	if err != nil {
		return AdapterQueryResult{}, err
	}

	queryCtx, cancel := context.WithTimeout(ctx, a.requestTimeout)
	defer cancel()

	matrix, err := a.prom.QueryRange(queryCtx, query, req.Range)
	if err != nil {
		switch {
		case errors.Is(err, ErrUpstreamTimeout):
			return AdapterQueryResult{}, ErrUpstreamTimeout
		case errors.Is(err, ErrUpstream):
			return AdapterQueryResult{}, ErrUpstream
		default:
			return AdapterQueryResult{}, fmt.Errorf("%w: %v", ErrUpstream, err)
		}
	}

	points, err := aggregateMatrixSeries(matrix)
	if err != nil {
		return AdapterQueryResult{}, fmt.Errorf("aggregate_series: %w", err)
	}

	return AdapterQueryResult{
		Points:     points,
		SeriesName: fmt.Sprintf("resource_%s", req.ResourceID),
	}, nil
}
