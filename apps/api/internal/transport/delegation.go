package transport

import (
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/sb0rka/sb0rka/apps/api/internal/authz"
	coreauth "github.com/sb0rka/sb0rka/packages/core/auth"
)

// authorizeDelegation enforces delegated-token rules for the matched route.
// delegatedScope is the scope the route accepts from delegated tokens; an empty
// value means the route does not allow delegation at all.
func (s *Server) authorizeDelegation(w http.ResponseWriter, r *http.Request, id coreauth.AccessTokenIdentity, delegatedScope string) bool {
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
	if delegatedScope == "" || !authz.DelegationAllows(id, delegatedScope, r.PathValue("project_id")) {
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
	if resource := r.PathValue("resource_id"); resource != "" {
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
	live, err := s.deps.PlatformDatabase.IsLiveAgent(r.Context(), subjectID, hostID)
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
