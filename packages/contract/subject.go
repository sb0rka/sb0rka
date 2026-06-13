package contract

type SubjectUserProfile struct {
	UserID   string  `json:"user_id"`
	Username string  `json:"username"`
	Email    string  `json:"email"`
	Phone    *string `json:"phone,omitempty"`
}

type SubjectOrganizationProfile struct {
	OrganizationID string `json:"organization_id"`
	Name           string `json:"name"`
}

type SubjectResponse struct {
	SubjectID    string                      `json:"subject_id"`
	Kind         string                      `json:"kind"`
	IsActive     bool                        `json:"is_active"`
	User         *SubjectUserProfile         `json:"user,omitempty"`
	Organization *SubjectOrganizationProfile `json:"organization,omitempty"`
}
