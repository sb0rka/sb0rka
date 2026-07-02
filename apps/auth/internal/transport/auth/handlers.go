package auth

import (
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/sb0rka/sb0rka/apps/auth/internal/domain/model"
	"github.com/sb0rka/sb0rka/apps/auth/internal/service"
	"github.com/sb0rka/sb0rka/apps/auth/internal/store/db"
	"github.com/sb0rka/sb0rka/apps/auth/internal/transport/runtime"
	"github.com/sb0rka/sb0rka/apps/auth/pkg/subject"
	"github.com/sb0rka/sb0rka/packages/contract"
	"github.com/sb0rka/sb0rka/packages/core/transport/authctx"
)

type Handler struct {
	deps runtime.Dependencies
}

func NewHandler(deps runtime.Dependencies) *Handler {
	return &Handler{deps: deps}
}

func (h *Handler) AuthLogin(w http.ResponseWriter, r *http.Request) {
	var req contract.AuthLoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	var usernameRaw, emailRaw string
	if req.Username != nil {
		usernameRaw = *req.Username
	}
	if req.Email != nil {
		emailRaw = *req.Email
	}
	passwordRaw := req.Password

	if usernameRaw == "" && emailRaw == "" {
		http.Error(w, "Username or email is required", http.StatusBadRequest)
		return
	}

	// Validate input

	var username, email string
	var err error

	if usernameRaw != "" {
		username, err = service.ValidateUsername(usernameRaw)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	}
	if emailRaw != "" {
		email, err = service.ValidateEmail(emailRaw)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	}
	password, err := service.ValidatePassword(passwordRaw)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Get user by username or email

	user, err := h.deps.Database.GetUser(r.Context(), "", username, email)
	if err != nil {
		if errors.Is(err, db.ErrUserNotFound) {
			http.Error(w, "User not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("login_get_user_failed", "error", err)
		http.Error(w, "Failed to get user", http.StatusInternalServerError)
		return
	}

	if !user.IsActive {
		http.Error(w, "User is not active", http.StatusUnauthorized)
		return
	}

	// Verify password

	ok, err := service.VerifyPassword(password, user.PasswordHash, h.deps.Cfg.AuthConfig)
	if err != nil {
		h.deps.Log.Error("login_verify_password_failed", "error", err)
		http.Error(w, "Failed to verify password", http.StatusInternalServerError)
		return
	}
	if !ok {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	// Create refresh token pair

	refreshToken, refreshTokenHash, err := service.CreateRefreshTokenPair(h.deps.Cfg.AuthConfig)
	if err != nil {
		h.deps.Log.Error("login_refresh_token_create_failed", "error", err)
		http.Error(w, "Failed to create refresh token", http.StatusInternalServerError)
		return
	}

	// Parse client IP, user agent and create auth session

	clientIP := r.RemoteAddr
	if host, _, splitErr := net.SplitHostPort(r.RemoteAddr); splitErr == nil {
		clientIP = host
	}

	userAgentRaw := r.UserAgent()
	var userAgent *string
	if userAgentRaw != "" {
		userAgent = &userAgentRaw
	}

	sessionID := uuid.New()
	familyID := uuid.New()

	expiresAt := time.Now().UTC().Add(h.deps.Cfg.AuthConfig.AccessSessionTTL)

	session, err := h.deps.Database.CreateAuthSession(r.Context(), sessionID, user.ID, familyID, refreshTokenHash, clientIP, userAgent, expiresAt)
	if err != nil {
		h.deps.Log.Error("login_create_session_failed", "error", err)
		http.Error(w, "Failed to create auth session", http.StatusInternalServerError)
		return
	}

	// Issue access token

	accessToken, err := service.CreateAccessToken(user.ID, session.ID, session.SubjectKind, h.deps.Cfg.AuthConfig)
	if err != nil {
		h.deps.Log.Error("login_access_token_create_failed", "error", err)
		http.Error(w, "Failed to create access token", http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     h.deps.Cfg.AuthConfig.RefreshTokenCookieName,
		Value:    refreshToken,
		Path:     h.deps.Cfg.AuthConfig.RefreshTokenCookiePath,
		Domain:   h.deps.Cfg.AuthConfig.RefreshTokenCookieDomain,
		Expires:  expiresAt,
		HttpOnly: h.deps.Cfg.AuthConfig.RefreshTokenCookieHttpOnly,
		Secure:   h.deps.Cfg.AuthConfig.RefreshTokenCookieSecure,
		SameSite: h.deps.Cfg.AuthConfig.RefreshTokenCookieSameSite,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ToAuthLoginResponse(accessToken, ""))
}

func (h *Handler) AuthRefresh(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(h.deps.Cfg.AuthConfig.RefreshTokenCookieName)
	if err != nil {
		http.Error(w, "missing refresh token", http.StatusUnauthorized)
		return
	}

	// Validate length of refresh token and get hash

	refreshToken, err := service.ValidateLengthOfRefreshToken(cookie.Value, h.deps.Cfg.AuthConfig)
	if err != nil {
		http.Error(w, "invalid refresh token", http.StatusUnauthorized)
		return
	}

	refreshTokenHash := service.HashRefreshToken(refreshToken)

	clientIP := r.RemoteAddr
	if host, _, splitErr := net.SplitHostPort(r.RemoteAddr); splitErr == nil {
		clientIP = host
	}

	userAgentRaw := r.UserAgent()
	var userAgent *string
	if userAgentRaw != "" {
		userAgent = &userAgentRaw
	}

	newSessionID := uuid.New()
	expiresAt := time.Now().UTC().Add(h.deps.Cfg.AuthConfig.AccessSessionTTL)
	newRefreshToken, newRefreshTokenHash, err := service.CreateRefreshTokenPair(h.deps.Cfg.AuthConfig)
	if err != nil {
		h.deps.Log.Error("refresh_token_create_failed", "error", err)
		http.Error(w, "Failed to create refresh token", http.StatusInternalServerError)
		return
	}

	newSession, err := h.deps.Database.RefreshAuthSession(r.Context(), refreshTokenHash, newSessionID, newRefreshTokenHash, clientIP, userAgent, expiresAt)
	if err != nil {
		if errors.Is(err, db.ErrTokenNotFound) || errors.Is(err, db.ErrTokenExpired) || errors.Is(err, db.ErrTokenReuseDetected) || errors.Is(err, db.ErrUserNotFound) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		h.deps.Log.Error("refresh_rotate_session_failed", "error", err)
		http.Error(w, "Failed to rotate auth session", http.StatusInternalServerError)
		return
	}

	accessToken, err := service.CreateAccessToken(newSession.SubjectID, newSession.ID, newSession.SubjectKind, h.deps.Cfg.AuthConfig)
	if err != nil {
		h.deps.Log.Error("refresh_access_token_create_failed", "error", err)
		http.Error(w, "Failed to create access token", http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     h.deps.Cfg.AuthConfig.RefreshTokenCookieName,
		Value:    newRefreshToken,
		Path:     h.deps.Cfg.AuthConfig.RefreshTokenCookiePath,
		Domain:   h.deps.Cfg.AuthConfig.RefreshTokenCookieDomain,
		Expires:  expiresAt,
		HttpOnly: h.deps.Cfg.AuthConfig.RefreshTokenCookieHttpOnly,
		Secure:   h.deps.Cfg.AuthConfig.RefreshTokenCookieSecure,
		SameSite: h.deps.Cfg.AuthConfig.RefreshTokenCookieSameSite,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ToAuthLoginResponse(accessToken, ""))
}

func (h *Handler) AuthLogout(w http.ResponseWriter, r *http.Request) {
	subjectIDRaw, ok := authctx.SubjectIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	sessionIDRaw, ok := authctx.SessionIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	sessionID, err := uuid.Parse(sessionIDRaw)
	if err != nil {
		h.deps.Log.Error("logout_invalid_session_id", "subject_id", subjectIDRaw, "session_id", sessionIDRaw, "error", err)
		http.Error(w, "Invalid session id", http.StatusInternalServerError)
		return
	}

	subjectID, err := uuid.Parse(subjectIDRaw)
	if err != nil {
		h.deps.Log.Error("logout_invalid_subject_id", "subject_id", subjectIDRaw, "error", err)
		http.Error(w, "Invalid subject id", http.StatusInternalServerError)
		return
	}

	if err := h.deps.Database.RevokeAuthSession(r.Context(), sessionID, subjectID, "logout", nil); err != nil {
		if errors.Is(err, db.ErrTokenNotFound) {
			// Idempotent: already revoked, still clear the cookie
		} else {
			h.deps.Log.Error("logout_revoke_session_failed", "subject_id", subjectIDRaw, "session_id", sessionIDRaw, "error", err)
			http.Error(w, "Failed to revoke auth session", http.StatusInternalServerError)
			return
		}
	}

	h.clearRefreshCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) AuthSessionsList(w http.ResponseWriter, r *http.Request) {
	subjectIDRaw, ok := authctx.SubjectIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Sessions listing is currently restricted to user-backed subjects
	_, isUser := authctx.RequireUserSubject(r.Context())
	if !isUser {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	currentSessionID, ok := authctx.SessionIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	subjectID, err := uuid.Parse(subjectIDRaw)
	if err != nil {
		h.deps.Log.Error("sessions_invalid_subject_id", "subject_id", subjectIDRaw, "error", err)
		http.Error(w, "Invalid subject id", http.StatusInternalServerError)
		return
	}

	sessions, err := h.deps.Database.ListAuthSessions(r.Context(), subjectID)
	if err != nil {
		h.deps.Log.Error("sessions_list_failed", "subject_id", subjectIDRaw, "error", err)
		http.Error(w, "Failed to list sessions", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ToAuthSessionsResponse(sessions, currentSessionID))
}

func (h *Handler) AuthSessionsRevokeAll(w http.ResponseWriter, r *http.Request) {
	subjectIDRaw, ok := authctx.SubjectIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	subjectID, err := uuid.Parse(subjectIDRaw)
	if err != nil {
		h.deps.Log.Error("sessions_revoke_all_invalid_subject_id", "subject_id", subjectIDRaw, "error", err)
		http.Error(w, "Invalid subject id", http.StatusInternalServerError)
		return
	}

	if err := h.deps.Database.RevokeAllAuthSessions(r.Context(), subjectID); err != nil {
		h.deps.Log.Error("sessions_revoke_all_failed", "subject_id", subjectIDRaw, "error", err)
		http.Error(w, "Failed to revoke all sessions", http.StatusInternalServerError)
		return
	}

	h.clearRefreshCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) AuthSessionRevokeOne(w http.ResponseWriter, r *http.Request) {
	subjectIDRaw, ok := authctx.SubjectIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	sessionIDRaw := r.PathValue("session_id")
	if sessionIDRaw == "" {
		http.Error(w, "Missing session_id", http.StatusBadRequest)
		return
	}
	sessionID, err := uuid.Parse(sessionIDRaw)
	if err != nil {
		http.Error(w, "Invalid session_id", http.StatusBadRequest)
		return
	}

	subjectID, err := uuid.Parse(subjectIDRaw)
	if err != nil {
		h.deps.Log.Error("session_revoke_one_invalid_subject_id", "subject_id", subjectIDRaw, "error", err)
		http.Error(w, "Invalid subject id", http.StatusInternalServerError)
		return
	}

	if err := h.deps.Database.RevokeAuthSession(r.Context(), sessionID, subjectID, "logout", nil); err != nil {
		if errors.Is(err, db.ErrTokenNotFound) {
			http.Error(w, "Session not found", http.StatusNotFound)
			return
		}
		h.deps.Log.Error("session_revoke_one_failed", "subject_id", subjectIDRaw, "session_id", sessionIDRaw, "error", err)
		http.Error(w, "Failed to revoke session", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// AuthGetSubject returns the current authenticated subject identity and typed profile.
func (h *Handler) AuthGetSubject(w http.ResponseWriter, r *http.Request) {
	subjectIDRaw, ok := authctx.SubjectIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	subjectID, err := uuid.Parse(subjectIDRaw)
	if err != nil {
		h.deps.Log.Error("get_subject_invalid_id", "subject_id", subjectIDRaw, "error", err)
		http.Error(w, "Invalid subject id", http.StatusInternalServerError)
		return
	}

	sub, err := h.deps.Database.GetSubject(r.Context(), subjectID)
	if err != nil {
		if errors.Is(err, db.ErrSubjectNotFound) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		h.deps.Log.Error("get_subject_failed", "subject_id", subjectIDRaw, "error", err)
		http.Error(w, "Failed to get subject", http.StatusInternalServerError)
		return
	}

	var resp contract.SubjectResponse
	resp.SubjectID = sub.ID.String()
	resp.Kind = sub.Kind

	switch sub.Kind {
	case model.SubjectKindUser:
		user, err := h.deps.Database.GetUser(r.Context(), subjectIDRaw, "", "")
		if err != nil {
			if errors.Is(err, db.ErrUserNotFound) {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}
			h.deps.Log.Error("get_subject_user_failed", "subject_id", subjectIDRaw, "error", err)
			http.Error(w, "Failed to get subject profile", http.StatusInternalServerError)
			return
		}
		if !user.IsActive {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		resp.IsActive = true
		profile := &contract.SubjectUserProfile{
			UserID:   user.ID.String(),
			Username: user.Username,
			Email:    user.Email,
		}
		if user.Phone != nil {
			p := strconv.Itoa(int(*user.Phone))
			profile.Phone = &p
		}
		resp.User = profile

	default:
		// Other subject kinds are resolvable only when a profile resolver
		// for that kind is registered via authapp options.
		resolve, ok := h.deps.SubjectResolvers[sub.Kind]
		if !ok {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		if err := resolve(r.Context(), subjectID, &resp); err != nil {
			if errors.Is(err, subject.ErrProfileNotFound) {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}
			h.deps.Log.Error("get_subject_profile_failed", "subject_id", subjectIDRaw, "kind", sub.Kind, "error", err)
			http.Error(w, "Failed to get subject profile", http.StatusInternalServerError)
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func ToAuthLoginResponse(accessToken, refreshToken string) contract.AuthLoginResponse {
	return contract.AuthLoginResponse{
		AccessToken: accessToken,
	}
}

func ToUserResponse(u model.User) contract.UserResponse {
	user := contract.UserResponse{
		ID:        u.ID.String(),
		Username:  u.Username,
		Email:     u.Email,
		CreatedAt: u.CreatedAt,
		UpdatedAt: u.UpdatedAt,
	}
	if u.Phone != nil {
		p := strconv.Itoa(int(*u.Phone))
		user.Phone = &p
	}
	return user
}

func ToAuthSessionResponse(s model.AuthSession, currentSessionID string) contract.AuthSessionResponse {
	userAgent := ""
	if s.CreatedUserAgent != nil {
		userAgent = strings.TrimSpace(*s.CreatedUserAgent)
	}

	return contract.AuthSessionResponse{
		ID:        s.ID.String(),
		IsCurrent: s.ID.String() == currentSessionID,
		CreatedAt: s.CreatedAt,
		ExpiresAt: s.ExpiresAt,
		UserAgent: userAgent,
		IP:        normalizeSessionIP(s.CreatedIP.String()),
	}
}

func normalizeSessionIP(raw string) string {
	ip := strings.TrimSpace(raw)
	if ip == "" || ip == "<nil>" {
		return ""
	}
	parsed := net.ParseIP(ip)
	if parsed == nil {
		return ip
	}
	return parsed.String()
}

func ToAuthSessionsResponse(sessions []model.AuthSession, currentSessionID string) []contract.AuthSessionResponse {
	out := make([]contract.AuthSessionResponse, 0, len(sessions))
	for _, s := range sessions {
		out = append(out, ToAuthSessionResponse(s, currentSessionID))
	}
	return out
}

func (h *Handler) clearRefreshCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     h.deps.Cfg.AuthConfig.RefreshTokenCookieName,
		Value:    "",
		Path:     h.deps.Cfg.AuthConfig.RefreshTokenCookiePath,
		Domain:   h.deps.Cfg.AuthConfig.RefreshTokenCookieDomain,
		Expires:  time.Unix(0, 0).UTC(),
		MaxAge:   -1,
		HttpOnly: h.deps.Cfg.AuthConfig.RefreshTokenCookieHttpOnly,
		Secure:   h.deps.Cfg.AuthConfig.RefreshTokenCookieSecure,
		SameSite: h.deps.Cfg.AuthConfig.RefreshTokenCookieSameSite,
	})
}
