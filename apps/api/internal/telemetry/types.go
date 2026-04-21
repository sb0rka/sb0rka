package telemetry

import (
	"errors"
	"time"
)

type Metric string

const (
	MetricActiveConnections Metric = "active_connections"
	MetricDBSizeRate        Metric = "db_size_rate"
	MetricDBSize            Metric = "db_size"
	MetricNetReceive        Metric = "net_receive"
	MetricNetTransmit       Metric = "net_transmit"
)

var (
	ErrUnknownMetric    = errors.New("unknown metric")
	ErrResourceNotFound = errors.New("telemetry resource not found")
	ErrUpstream         = errors.New("telemetry upstream error")
	ErrUpstreamTimeout  = errors.New("telemetry upstream timeout")
)

type TimeRange struct {
	From time.Time
	To   time.Time
	Step time.Duration
}

type Point struct {
	TS    time.Time
	Value float64
}

type Timeseries struct {
	Metric     Metric
	Unit       string
	Range      TimeRange
	Points     []Point
	SeriesName string
}

func ParseMetric(raw string) (Metric, error) {
	switch Metric(raw) {
	case MetricActiveConnections, MetricDBSizeRate, MetricDBSize, MetricNetReceive, MetricNetTransmit:
		return Metric(raw), nil
	default:
		return "", ErrUnknownMetric
	}
}

func UnitForMetric(metric Metric) (string, error) {
	switch metric {
	case MetricActiveConnections:
		return "count", nil
	case MetricDBSize:
		return "bytes", nil
	case MetricDBSizeRate:
		return "percent", nil
	case MetricNetReceive, MetricNetTransmit:
		return "bytes_per_second", nil
	default:
		return "", ErrUnknownMetric
	}
}
