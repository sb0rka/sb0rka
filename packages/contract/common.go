package contract

const (
	EditionCommunity  = "community"
	EditionEnterprise = "enterprise"

	DeploymentSelfHosted = "self_hosted"
	DeploymentCloud      = "cloud"
)

type InfoResponse struct {
	Version    string `json:"version" binding:"required"`
	Edition    string `json:"edition" binding:"required" enums:"community,enterprise"`
	Deployment string `json:"deployment" binding:"required" enums:"self_hosted,cloud"`
}

type PingResponse struct {
	Message string `json:"message"`
}

type HealthResponse struct {
	Status         string `json:"status"`
	ResponseTimeMs int64  `json:"response_time_ms"`
}
