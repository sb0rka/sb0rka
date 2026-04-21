package telemetry

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/sb0rka/sb0rka/apps/api/internal/domain/model"
	"github.com/sb0rka/sb0rka/apps/api/internal/store/db"
)

const (
	defaultStep      = 5 * time.Minute
	defaultRangeSpan = 24 * time.Hour
)

type DatabaseGate interface {
	GetDatabase(ctx context.Context, userID uuid.UUID, projectID string, resourceID string) (model.DB, error)
}

type Service interface {
	QueryResourceTimeseries(ctx context.Context, req QueryRequest) (Timeseries, error)
}

type QueryRequest struct {
	UserID     uuid.UUID
	ProjectID  string
	ResourceID string
	Metric     Metric
}

type AdapterQueryRequest struct {
	UserID       uuid.UUID
	ProjectID    string
	ResourceID   string
	DatabaseName string
	Metric       Metric
	Range        TimeRange
}

type AdapterQueryResult struct {
	Points     []Point
	SeriesName string
}

type InfraAdapter interface {
	QueryResourceMetric(ctx context.Context, req AdapterQueryRequest) (AdapterQueryResult, error)
}

type service struct {
	gate    DatabaseGate
	adapter InfraAdapter
	nowFn   func() time.Time
}

func NewService(gate DatabaseGate, adapter InfraAdapter) Service {
	return &service{
		gate:    gate,
		adapter: adapter,
		nowFn:   time.Now,
	}
}

func newService(gate DatabaseGate, adapter InfraAdapter, nowFn func() time.Time) Service {
	return &service{
		gate:    gate,
		adapter: adapter,
		nowFn:   nowFn,
	}
}

func (s *service) QueryResourceTimeseries(ctx context.Context, req QueryRequest) (Timeseries, error) {
	unit, err := UnitForMetric(req.Metric)
	if err != nil {
		return Timeseries{}, err
	}

	row, err := s.gate.GetDatabase(ctx, req.UserID, req.ProjectID, req.ResourceID)
	if err != nil {
		if errors.Is(err, db.ErrProjectNotFound) || errors.Is(err, db.ErrResourceNotFound) {
			return Timeseries{}, ErrResourceNotFound
		}
		return Timeseries{}, fmt.Errorf("get_database: %w", err)
	}

	end := s.nowFn().UTC().Truncate(defaultStep)
	rng := TimeRange{
		From: end.Add(-defaultRangeSpan),
		To:   end,
		Step: defaultStep,
	}

	result, err := s.adapter.QueryResourceMetric(ctx, AdapterQueryRequest{
		UserID:       req.UserID,
		ProjectID:    req.ProjectID,
		ResourceID:   req.ResourceID,
		DatabaseName: row.Name,
		Metric:       req.Metric,
		Range:        rng,
	})
	if err != nil {
		return Timeseries{}, err
	}

	return Timeseries{
		Metric:     req.Metric,
		Unit:       unit,
		Range:      rng,
		Points:     result.Points,
		SeriesName: result.SeriesName,
	}, nil
}
