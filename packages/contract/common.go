package contract

type PingResponse struct {
	Message string `json:"message"`
}

type HealthResponse struct {
	Status         string `json:"status"`
	ResponseTimeMs int64  `json:"response_time_ms"`
}
