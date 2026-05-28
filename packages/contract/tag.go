package contract

type TagListEntry struct {
	ID         int64   `json:"id"`
	TagKey     string  `json:"tag_key"`
	TagValue   string  `json:"tag_value"`
	Color      *string `json:"color,omitempty"`
	IsSystem   bool    `json:"is_system"`
	IsReadonly bool    `json:"is_readonly"`
}

type TagResponse struct {
	ID         int64   `json:"id"`
	ProjectID  string  `json:"project_id"`
	TagKey     string  `json:"tag_key"`
	TagValue   string  `json:"tag_value"`
	Color      *string `json:"color,omitempty"`
	IsSystem   bool    `json:"is_system"`
	IsReadonly bool    `json:"is_readonly"`
}

type ProjectTagListResponse struct {
	ProjectID string         `json:"project_id"`
	Tags      []TagListEntry `json:"tags"`
}

type ResourceTagListResponse struct {
	ProjectID  string         `json:"project_id"`
	ResourceID string         `json:"resource_id"`
	Tags       []TagListEntry `json:"tags"`
}

type AttachResourceTagRequest struct {
	TagKey   string  `json:"tag_key"`
	TagValue string  `json:"tag_value"`
	Color    *string `json:"color,omitempty"`
}
