package transport

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/sb0rka/sb0rka/apps/auth/internal/domain/model"
	"github.com/sb0rka/sb0rka/apps/auth/internal/service"
	"github.com/sb0rka/sb0rka/packages/core/transport/authctx"
)

const platformMembershipTimeout = 5 * time.Second

var platformMembershipClient = &http.Client{
	Timeout: platformMembershipTimeout,
	CheckRedirect: func(*http.Request, []*http.Request) error {
		return http.ErrUseLastResponse
	},
}

type investigationAgentTokenRequest struct {
	ProjectID       string `json:"project_id"`
	InvestigationID string `json:"investigation_id"`
}

type investigationAgentTokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int64  `json:"expires_in"`
}

// issueInvestigationAgentToken delegates only the investigation capabilities
// needed by an OpenCode environment; the caller cannot select claims or TTL.
func (s *Server) issueInvestigationAgentToken(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	r.Body = http.MaxBytesReader(w, r.Body, 4<<10)

	var input investigationAgentTokenRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	input.ProjectID = strings.TrimSpace(input.ProjectID)
	investigationID, err := uuid.Parse(strings.TrimSpace(input.InvestigationID))
	if !validProjectID(input.ProjectID) || err != nil || investigationID == uuid.Nil {
		http.Error(w, "Invalid project_id or investigation_id", http.StatusBadRequest)
		return
	}

	identity, ok := authctx.IdentityFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if identity.SubjectKind != model.SubjectKindUser {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	if status := s.checkProjectMembership(r, input.ProjectID); status != http.StatusOK {
		s.deps.Log.Info("investigation_agent_token_not_issued", "subject_id", identity.SubjectID,
			"project_id", input.ProjectID, "investigation_id", investigationID, "result", http.StatusText(status))
		http.Error(w, http.StatusText(status), status)
		return
	}

	token, jti, err := service.CreateInvestigationAgentToken(
		identity.SubjectID,
		identity.SessionID,
		identity.SubjectKind,
		identity.ClientID,
		input.ProjectID,
		investigationID.String(),
		s.deps.Cfg.AuthConfig,
	)
	if err != nil {
		s.deps.Log.Error("investigation_agent_token_issue_failed", "subject_id", identity.SubjectID, "project_id", input.ProjectID,
			"investigation_id", investigationID, "jti", jti, "result", "sign_failed", "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	s.deps.Log.Info("investigation_agent_token_issued", "subject_id", identity.SubjectID, "project_id", input.ProjectID,
		"investigation_id", investigationID, "jti", jti, "result", "issued")
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(investigationAgentTokenResponse{
		AccessToken: token,
		TokenType:   "Bearer",
		ExpiresIn:   int64(service.InvestigationAgentTokenTTL / time.Second),
	})
}

func (s *Server) checkProjectMembership(r *http.Request, projectID string) int {
	baseURL := strings.TrimSpace(s.deps.Cfg.PlatformAPIBaseURL)
	if baseURL == "" {
		return http.StatusServiceUnavailable
	}
	ctx, cancel := context.WithTimeout(r.Context(), platformMembershipTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/projects/"+projectID, nil)
	if err != nil {
		return http.StatusServiceUnavailable
	}
	req.Header.Set("Authorization", r.Header.Get("Authorization"))
	response, err := platformMembershipClient.Do(req)
	if err != nil {
		return http.StatusServiceUnavailable
	}
	defer response.Body.Close()
	_, _ = io.Copy(io.Discard, response.Body)

	switch response.StatusCode {
	case http.StatusOK:
		return http.StatusOK
	case http.StatusUnauthorized:
		return http.StatusUnauthorized
	case http.StatusForbidden, http.StatusNotFound:
		return http.StatusForbidden
	default:
		return http.StatusServiceUnavailable
	}
}

func validProjectID(value string) bool {
	if len(value) < 10 || len(value) > 12 {
		return false
	}
	for _, char := range value {
		if (char < '0' || char > '9') && (char < 'a' || char > 'f') {
			return false
		}
	}
	return true
}
