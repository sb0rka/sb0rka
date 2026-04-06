package contract

type TagResponse struct {
	ID        int64   `json:"id"`
	ProjectID int64   `json:"project_id"`
	TagKey    string  `json:"tag_key"`
	TagValue  string  `json:"tag_value"`
	Color     *string `json:"color,omitempty"`
	IsSystem  bool    `json:"is_system"`
}

type ProjectTagListResponse struct {
	Tags []TagResponse `json:"tags"`
}

type AttachResourceTagRequest struct {
	TagKey   string  `json:"tag_key"`
	TagValue string  `json:"tag_value"`
	Color    *string `json:"color,omitempty"`
}
