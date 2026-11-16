package transport

import (
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/sb0rka/sb0rka/apps/api/internal/authz"
	coreauth "github.com/sb0rka/sb0rka/packages/core/auth"
)

// Empty anyOfScopes rejects delegation; otherwise one matching scope suffices.
type anyOfScopes []string

// authorizeDelegation enforces delegated-token rules for the matched route.
func (s *Server) authorizeDelegation(w http.ResponseWriter, r *http.Request, id coreauth.AccessTokenIdentity, acceptedScopes anyOfScopes) bool {
	if id.ActorSubjectID == "" {
		registered, err := s.deps.PlatformDatabase.RegisteredAccessClient(r.Context(), id.ClientID, s.deps.Cfg.AuthConfig.AccessTokenAudience)
		if err != nil {
			http.Error(w, "Authorization unavailable", http.StatusServiceUnavailable)
			return false
		}
		if !registered {
			http.Error(w, "Client not permitted", http.StatusForbidden)
			return false
		}
		return true
	}
	sessionID, err := uuid.Parse(id.SessionID)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return false
	}
	subjectID, err := uuid.Parse(id.SubjectID)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return false
	}
	selectedScope := ""
	for _, scope := range acceptedScopes {
		if authz.DelegationAllows(id, scope, r.PathValue("project_id")) {
			selectedScope = scope
			break
		}
	}
	if selectedScope == "" {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return false
	}
	live, err := s.deps.PlatformDatabase.LiveDelegation(r.Context(), id.DelegationID, id.DelegationVersion, id.SubjectID, id.ClientID, id.ActorSubjectID, strings.Fields(id.Scope), id.ProjectIDs, s.deps.Cfg.AuthConfig.AccessTokenAudience)
	if err != nil {
		http.Error(w, "Authorization unavailable", http.StatusServiceUnavailable)
		return false
	}
	if !live {
		http.Error(w, "Delegation revoked", http.StatusForbidden)
		return false
	}
	live, err = s.deps.PlatformDatabase.IsLiveSession(r.Context(), sessionID, subjectID)
	if err != nil {
		http.Error(w, "Authorization unavailable", http.StatusServiceUnavailable)
		return false
	}
	if !live {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return false
	}
	if resource := r.PathValue("resource_id"); resource != "" && id.ClientID == coreauth.ClientSOMWeb {
		allowed, err := s.deps.PlatformDatabase.SecretBoundToUserAgent(r.Context(), r.PathValue("project_id"), resource, id.ActorSubjectID, id.SubjectID)
		if err != nil {
			http.Error(w, "Authorization unavailable", http.StatusServiceUnavailable)
			return false
		}
		if !allowed {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return false
		}
	}
	return true
}

// authorizeAgent allows an enrolled agent to use only the routes marked for it.
// A resource path is limited to secrets bound to that agent.
func (s *Server) authorizeAgent(w http.ResponseWriter, r *http.Request, id coreauth.AccessTokenIdentity) bool {
	subjectID, err := uuid.Parse(id.SubjectID)
	hostID, hostErr := uuid.Parse(id.HostID)
	if err != nil || hostErr != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return false
	}
	live, err := s.deps.PlatformDatabase.IsLiveAgent(r.Context(), subjectID, hostID, id.ClientID, id.KeyThumbprint)
	if err != nil {
		http.Error(w, "Authorization unavailable", http.StatusServiceUnavailable)
		return false
	}
	if !live {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return false
	}
	if resource := r.PathValue("resource_id"); resource != "" {
		allowed, err := s.deps.PlatformDatabase.SecretBoundToAgent(r.Context(), r.PathValue("project_id"), resource, id.SubjectID)
		if err != nil {
			http.Error(w, "Authorization unavailable", http.StatusServiceUnavailable)
			return false
		}
		if !allowed {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return false
		}
	}
	return true
}
