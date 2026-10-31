package telemetry

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/sb0rka/sb0rka/apps/api/internal/authz"
	tel "github.com/sb0rka/sb0rka/apps/api/internal/telemetry"
	"github.com/sb0rka/sb0rka/apps/api/internal/transport/runtime"
	"github.com/sb0rka/sb0rka/packages/contract"
	"github.com/sb0rka/sb0rka/packages/core/transport/authctx"

	"github.com/google/uuid"
)

type Handler struct {
	deps runtime.Dependencies
}

func NewHandler(deps runtime.Dependencies) *Handler {
	return &Handler{deps: deps}
}

func parseSubjectID(r *http.Request) (uuid.UUID, bool) {
	raw, ok := authctx.SubjectIDFromContext(r.Context())
	if !ok {
		return uuid.Nil, false
	}
	id, err := uuid.Parse(strings.TrimSpace(raw))
	if err != nil {
		return uuid.Nil, false
	}
	return id, true
}

func parsePathID(raw, name string) (string, error) {
	return runtime.ParsePublicID(raw, name)
}

func (h *Handler) authorize(w http.ResponseWriter, r *http.Request, callerID uuid.UUID, action authz.Action, projectPublicID string) (uuid.UUID, bool) {
	decision, err := h.deps.Authorizer.Authorize(r.Context(), authz.PrincipalFromContext(r.Context(), callerID), action, authz.ResourceRef{
		Type:     "project",
		PublicID: projectPublicID,
	})
	if err != nil {
		h.deps.Log.Error("authorize_failed", "action", action, "project_public_id", projectPublicID, "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return uuid.Nil, false
	}
	if !decision.Allowed {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"error":"forbidden"}`))
		return uuid.Nil, false
	}
	return decision.Resource.ID, true
}

// GetResourceMetricTimeseries godoc
// @Summary  Временной ряд метрики ресурса
// @Tags     telemetry
// @Produce  json
// @Param    project_id   path      string  true  "Public ID проекта (10 строчных hex-символов)" minlength(10) maxlength(10)
// @Param    resource_id  path      string  true  "Public ID ресурса (12 строчных hex-символов)" minlength(12) maxlength(12)
// @Param    metric       query     string  true  "Имя метрики"
// @Success  200          {object}  contract.TelemetryTimeseriesResponse
// @Failure  400          {string}  string
// @Failure  403          {string}  string
// @Failure  404          {string}  string
// @Failure  502          {string}  string
// @Failure  504          {string}  string
// @Security BearerAuth
// @Router   /projects/{project_id}/resources/{resource_id}/observability/metrics/timeseries [get]
func (h *Handler) GetResourceMetricTimeseries(w http.ResponseWriter, r *http.Request) {
	subjectID, ok := parseSubjectID(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	projectPublicID, err := parsePathID(r.PathValue("project_id"), "project_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	resourcePublicID, err := parsePathID(r.PathValue("resource_id"), "resource_id")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	projectID, ok := h.authorize(w, r, subjectID, authz.ActionDBRead, projectPublicID)
	if !ok {
		return
	}

	metric, err := tel.ParseMetric(strings.TrimSpace(r.URL.Query().Get("metric")))
	if err != nil {
		http.Error(w, "Unknown metric", http.StatusBadRequest)
		return
	}

	timeseries, err := h.deps.Telemetry.QueryResourceTimeseries(r.Context(), tel.QueryRequest{
		SubjectID:        subjectID,
		ProjectID:        projectID,
		ResourcePublicID: resourcePublicID,
		Metric:           metric,
	})
	if err != nil {
		switch {
		case errors.Is(err, tel.ErrResourceNotFound):
			http.Error(w, "Resource not found", http.StatusNotFound)
		case errors.Is(err, tel.ErrUnknownMetric):
			http.Error(w, "Unknown metric", http.StatusBadRequest)
		case errors.Is(err, tel.ErrUpstreamTimeout):
			http.Error(w, "Telemetry upstream timeout", http.StatusGatewayTimeout)
		case errors.Is(err, tel.ErrUpstream):
			http.Error(w, "Telemetry upstream error", http.StatusBadGateway)
		default:
			h.deps.Log.Error("query_resource_timeseries_failed", "project_id", projectID, "resource_id", resourcePublicID, "metric", metric, "error", err)
			http.Error(w, "Failed to query telemetry", http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(toTimeseriesResponse(timeseries))
}

func toTimeseriesResponse(ts tel.Timeseries) contract.TelemetryTimeseriesResponse {
	points := make([]contract.TelemetryPointResponse, 0, len(ts.Points))
	for _, point := range ts.Points {
		points = append(points, contract.TelemetryPointResponse{
			Timestamp: point.TS,
			Value:     point.Value,
		})
	}
	return contract.TelemetryTimeseriesResponse{
		Metric: string(ts.Metric),
		Unit:   ts.Unit,
		Range: contract.TelemetryRangeResponse{
			From: ts.Range.From,
			To:   ts.Range.To,
			Step: ts.Range.Step.String(),
		},
		SeriesName: ts.SeriesName,
		Points:     points,
	}
}
