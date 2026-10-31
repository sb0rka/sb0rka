package contract

import "time"

type LLMModelResponse struct {
	ID            string                   `json:"id" format:"uuid"`
	Name          string                   `json:"name"`
	DescriptionEN *string                  `json:"description_en" extensions:"x-nullable"`
	DescriptionRU *string                  `json:"description_ru" extensions:"x-nullable"`
	Pricing       *LLMModelPricingResponse `json:"pricing" extensions:"x-nullable"`
	CreatedAt     time.Time                `json:"created_at"`
	UpdatedAt     time.Time                `json:"updated_at"`
}

type LLMModelPricingResponse struct {
	InputPer1M       MoneyAmounts `json:"input_per_1m"`
	OutputPer1M      MoneyAmounts `json:"output_per_1m"`
	CachedInputPer1M MoneyAmounts `json:"cached_input_per_1m"`
	RequestFee       MoneyAmounts `json:"request_fee"`
}

type LLMModelListResponse struct {
	Models []LLMModelResponse `json:"models"`
}
