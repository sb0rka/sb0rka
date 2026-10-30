package contract

import "time"

type LLMModelResponse struct {
	ID            string    `json:"id" format:"uuid"`
	Name          string    `json:"name"`
	DescriptionEN *string   `json:"description_en" extensions:"x-nullable"`
	DescriptionRU *string   `json:"description_ru" extensions:"x-nullable"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type LLMModelListResponse struct {
	Models []LLMModelResponse `json:"models"`
}
