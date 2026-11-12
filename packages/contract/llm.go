package contract

import "time"

type LLMModelResponse struct {
	ID            string                   `json:"id" format:"uuid"`
	Slug          string                   `json:"slug"`
	Name          string                   `json:"name"`
	DescriptionEN *string                  `json:"description_en" extensions:"x-nullable"`
	DescriptionRU *string                  `json:"description_ru" extensions:"x-nullable"`
	Pricing       *LLMModelPricingResponse `json:"pricing" extensions:"x-nullable"`
	Inference     *LLMModelInference       `json:"inference,omitempty"`
	CreatedAt     time.Time                `json:"created_at"`
	UpdatedAt     time.Time                `json:"updated_at"`
}

// LLMModelInference contains public model capabilities.
type LLMModelInference struct {
	Limit            LLMModelLimit             `json:"limit"`
	Modalities       LLMModelModalities        `json:"modalities"`
	Attachment       bool                      `json:"attachment"`
	Temperature      bool                      `json:"temperature"`
	ToolCall         bool                      `json:"tool_call"`
	Reasoning        bool                      `json:"reasoning"`
	ReasoningOptions []LLMModelReasoningOption `json:"reasoning_options,omitempty"`
}

type LLMModelLimit struct {
	Context int64  `json:"context"`
	Input   *int64 `json:"input,omitempty"`
	Output  int64  `json:"output"`
}

type LLMModelModalities struct {
	Input  []string `json:"input"`
	Output []string `json:"output"`
}

type LLMModelReasoningOption struct {
	Type   string    `json:"type" enums:"effort,toggle,budget_tokens"`
	Values []*string `json:"values,omitempty"`
	Min    *int64    `json:"min,omitempty"`
	Max    *int64    `json:"max,omitempty"`
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
