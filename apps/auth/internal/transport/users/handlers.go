package users

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/sb0rka/sb0rka/apps/auth/internal/domain/model"
	"github.com/sb0rka/sb0rka/apps/auth/internal/service"
	"github.com/sb0rka/sb0rka/apps/auth/internal/transport/runtime"
	"github.com/sb0rka/sb0rka/apps/auth/internal/store/db"
	"github.com/sb0rka/sb0rka/apps/auth/pkg/invite"
	"github.com/sb0rka/sb0rka/packages/contract"
)

type Handler struct {
	deps runtime.Dependencies
}

func NewHandler(deps runtime.Dependencies) *Handler {
	return &Handler{deps: deps}
}

// RegisterUser handles POST /identity/users — creates a new user-backed subject.
func (h *Handler) RegisterUser(w http.ResponseWriter, r *http.Request) {
	var req contract.RegisterUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Username == "" || req.Email == "" || req.Password == "" {
		http.Error(w, "Username, email and password are required", http.StatusBadRequest)
		return
	}

	username, err := service.ValidateUsername(req.Username)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	email, err := service.ValidateEmail(req.Email)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	password, err := service.ValidatePassword(req.Password)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	phoneStr := ""
	if req.Phone != nil {
		phoneStr = *req.Phone
	}
	phone, err := service.ValidatePhone(phoneStr, h.deps.Cfg.IsPhoneRequired)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	passwordHash, err := service.HashPassword(password, h.deps.Cfg.AuthConfig)
	if err != nil {
		h.deps.Log.Error("register_hash_password_failed", "error", err)
		http.Error(w, "Failed to hash password", http.StatusInternalServerError)
		return
	}

	userID := uuid.New()

	var inviteCode string
	if h.deps.RequireInvite {
		if req.InviteCode == nil || *req.InviteCode == "" {
			http.Error(w, "Invite code is required", http.StatusBadRequest)
			return
		}
		inviteCode = *req.InviteCode
		if err := h.deps.InviteProvider.Validate(r.Context(), inviteCode); err != nil {
			if errors.Is(err, invite.ErrInvalid) {
				http.Error(w, "Invite code not found or already used", http.StatusNotFound)
				return
			}
			h.deps.Log.Error("register_check_invite_failed", "error", err)
			http.Error(w, "Failed to check invite code", http.StatusInternalServerError)
			return
		}
	}

	user, err := h.deps.Database.CreateUser(r.Context(), userID, true, username, email, passwordHash, phone)
	if err != nil {
		if errors.Is(err, db.ErrUserAlreadyExists) {
			http.Error(w, "Username or email already exists", http.StatusConflict)
			return
		}
		h.deps.Log.Error("register_create_user_failed", "error", err)
		http.Error(w, "Failed to create user", http.StatusInternalServerError)
		return
	}

	if h.deps.RequireInvite {
		if err := h.deps.InviteProvider.Claim(r.Context(), inviteCode, userID); err != nil {
			h.deps.Log.Error("register_claim_invite_failed", "error", err)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(ToUserResponse(user))
}

func (h *Handler) GetUser(w http.ResponseWriter, r *http.Request) {
	subjectID, ok := runtime.AuthUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	user, err := h.deps.Database.GetUser(r.Context(), subjectID, "", "")
	if err != nil {
		if errors.Is(err, db.ErrUserNotFound) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		h.deps.Log.Error("get_user_failed", "subject_id", subjectID, "error", err)
		http.Error(w, "Failed to get user", http.StatusInternalServerError)
		return
	}

	if !user.IsActive {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ToUserResponse(user))
}

func (h *Handler) UserPatch(w http.ResponseWriter, r *http.Request) {
	subjectIDRaw, ok := runtime.AuthUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req contract.UserUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.Username == nil && req.Email == nil && req.Phone == nil {
		http.Error(w, "At least one field must be provided", http.StatusBadRequest)
		return
	}

	currentUser, err := h.deps.Database.GetUser(r.Context(), subjectIDRaw, "", "")
	if err != nil {
		if errors.Is(err, db.ErrUserNotFound) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		h.deps.Log.Error("user_patch_get_user_failed", "subject_id", subjectIDRaw, "error", err)
		http.Error(w, "Failed to get user", http.StatusInternalServerError)
		return
	}
	if !currentUser.IsActive {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	username := currentUser.Username
	email := currentUser.Email
	phone := 0
	if currentUser.Phone != nil {
		phone = int(*currentUser.Phone)
	}

	if req.Username != nil {
		username, err = service.ValidateUsername(*req.Username)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	}
	if req.Email != nil {
		email, err = service.ValidateEmail(*req.Email)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	}
	if req.Phone != nil {
		phone, err = service.ValidatePhone(*req.Phone, h.deps.Cfg.IsPhoneRequired)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	}

	phoneValue := ""
	if phone != 0 {
		phoneValue = strconv.Itoa(phone)
	}

	updatedUser, err := h.deps.Database.UpdateUser(r.Context(), currentUser.ID, username, email, phoneValue)
	if err != nil {
		if errors.Is(err, db.ErrUserAlreadyExists) {
			http.Error(w, "Username or email already exists", http.StatusConflict)
			return
		}
		if errors.Is(err, db.ErrUserNotFound) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		h.deps.Log.Error("user_patch_update_failed", "user_id", currentUser.ID.String(), "subject_id", subjectIDRaw, "error", err)
		http.Error(w, "Failed to update user", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ToUserResponse(updatedUser))
}

func (h *Handler) UserPasswordUpdate(w http.ResponseWriter, r *http.Request) {
	subjectIDRaw, ok := runtime.AuthUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req contract.UserPasswordUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.CurrentPassword == "" || req.NewPassword == "" {
		http.Error(w, "Current password and new password are required", http.StatusBadRequest)
		return
	}

	currentPassword, err := service.ValidatePassword(req.CurrentPassword)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	newPassword, err := service.ValidatePassword(req.NewPassword)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	user, err := h.deps.Database.GetUser(r.Context(), subjectIDRaw, "", "")
	if err != nil {
		if errors.Is(err, db.ErrUserNotFound) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		h.deps.Log.Error("user_password_get_user_failed", "subject_id", subjectIDRaw, "error", err)
		http.Error(w, "Failed to get user", http.StatusInternalServerError)
		return
	}
	if !user.IsActive {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	ok, err = service.VerifyPassword(currentPassword, user.PasswordHash, h.deps.Cfg.AuthConfig)
	if err != nil {
		h.deps.Log.Error("user_password_verify_failed", "user_id", user.ID.String(), "subject_id", subjectIDRaw, "error", err)
		http.Error(w, "Failed to verify current password", http.StatusInternalServerError)
		return
	}
	if !ok {
		http.Error(w, "Current password is incorrect", http.StatusBadRequest)
		return
	}

	passwordHash, err := service.HashPassword(newPassword, h.deps.Cfg.AuthConfig)
	if err != nil {
		h.deps.Log.Error("user_password_hash_failed", "user_id", user.ID.String(), "subject_id", subjectIDRaw, "error", err)
		http.Error(w, "Failed to hash new password", http.StatusInternalServerError)
		return
	}

	userID := user.ID
	if userID == uuid.Nil {
		h.deps.Log.Error("user_password_empty_user_id", "subject_id", subjectIDRaw)
		http.Error(w, "Invalid user id", http.StatusInternalServerError)
		return
	}

	if err := h.deps.Database.UpdateUserPassword(r.Context(), userID, passwordHash); err != nil {
		if errors.Is(err, db.ErrUserNotFound) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		h.deps.Log.Error("user_password_update_failed", "user_id", userID.String(), "subject_id", subjectIDRaw, "error", err)
		http.Error(w, "Failed to update password", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// UserDelete handles DELETE /identity/users/current — marks the user as inactive.
func (h *Handler) UserDelete(w http.ResponseWriter, r *http.Request) {
	subjectIDRaw, ok := runtime.AuthUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	userID, err := uuid.Parse(subjectIDRaw)
	if err != nil {
		h.deps.Log.Error("user_delete_invalid_id", "subject_id", subjectIDRaw, "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	if err := h.deps.Database.DeactivateUser(r.Context(), userID); err != nil {
		if errors.Is(err, db.ErrUserNotFound) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		h.deps.Log.Error("user_delete_failed", "user_id", userID.String(), "error", err)
		http.Error(w, "Failed to deactivate user", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
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
