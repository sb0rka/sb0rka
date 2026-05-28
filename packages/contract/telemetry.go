package contract

import "time"

type TelemetryPointResponse struct {
	Timestamp time.Time `json:"timestamp"`
	Value     float64   `json:"value"`
}

type TelemetryRangeResponse struct {
	From time.Time `json:"from"`
	To   time.Time `json:"to"`
	Step string    `json:"step"`
}

type TelemetryTimeseriesResponse struct {
	Metric     string                   `json:"metric"`
	Unit       string                   `json:"unit"`
	Range      TelemetryRangeResponse   `json:"range"`
	SeriesName string                   `json:"series_name"`
	Points     []TelemetryPointResponse `json:"points"`
}
