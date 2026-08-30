package transport

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/sb0rka/sb0rka/apps/auth/internal/domain/model"
	"github.com/sb0rka/sb0rka/apps/auth/internal/service"
	"github.com/sb0rka/sb0rka/apps/auth/internal/store/db"
)

type investigationAgentExchangeRequest struct {
	SubjectToken string `json:"subject_token"`
}

type investigationAgentExchangeResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int64  `json:"expires_in"`
}

// exchangeInvestigationAgentToken is an internal backend exchange. The caller
// proves both possession of the scoped agent token and the configured IR client
// secret; the resulting access JWT is returned only to IR and lives for the
// normal short access-token TTL.
func (s *Server) exchangeInvestigationAgentToken(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	clientID, clientSecret, ok := r.BasicAuth()
	if !ok || !s.validInvestigationAgentExchangeClient(clientID, clientSecret) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 8<<10)
	var input investigationAgentExchangeRequest
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
	input.SubjectToken = strings.TrimSpace(input.SubjectToken)
	claims, err := service.VerifyInvestigationAgentToken(input.SubjectToken, s.deps.Cfg.AuthConfig)
	if err != nil || !claims.HasScope(service.InvestigationAgentGatewayScope) || claims.SubjectKind != model.SubjectKindUser {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	subjectID, subjectErr := uuid.Parse(claims.Subject)
	sessionID, sessionErr := uuid.Parse(claims.SessionID)
	if subjectErr != nil || sessionErr != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	session, err := s.deps.Database.GetAuthSession(r.Context(), sessionID)
	if err != nil {
		if errors.Is(err, db.ErrTokenNotFound) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		s.deps.Log.Error("investigation_agent_exchange_session_failed", "session_id", claims.SessionID, "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if session.RevokedAt != nil || !session.ExpiresAt.After(time.Now().UTC()) || session.SubjectID != subjectID {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	accessToken, err := service.CreateClientAccessToken(subjectID, sessionID, claims.SubjectKind, clientID, s.deps.Cfg.AuthConfig)
	if err != nil {
		s.deps.Log.Error("investigation_agent_exchange_failed", "subject_id", claims.Subject,
			"project_id", claims.ProjectID, "investigation_id", claims.InvestigationID, "agent_jti", claims.ID, "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	s.deps.Log.Info("investigation_agent_exchanged", "subject_id", claims.Subject,
		"project_id", claims.ProjectID, "investigation_id", claims.InvestigationID, "agent_jti", claims.ID, "result", "issued")
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(investigationAgentExchangeResponse{
		AccessToken: accessToken,
		TokenType:   "Bearer",
		ExpiresIn:   int64(s.deps.Cfg.AuthConfig.AccessTokenTTL / time.Second),
	})
}

func (s *Server) validInvestigationAgentExchangeClient(clientID, clientSecret string) bool {
	cfg := s.deps.Cfg.InvestigationAgentExchange
	if cfg == nil {
		return false
	}
	expectedID := sha256.Sum256([]byte(cfg.ClientID))
	actualID := sha256.Sum256([]byte(clientID))
	expectedSecret := sha256.Sum256(cfg.ClientSecret)
	actualSecret := sha256.Sum256([]byte(clientSecret))
	return subtle.ConstantTimeCompare(expectedID[:], actualID[:]) == 1 &&
		subtle.ConstantTimeCompare(expectedSecret[:], actualSecret[:]) == 1
}
