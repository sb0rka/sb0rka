package contract

// MoneyAmounts contains backend-calculated decimal amounts in currency units.
type MoneyAmounts struct {
	RUB string  `json:"RUB" example:"100"`
	USD *string `json:"USD" extensions:"x-nullable" example:"1.04821802935"`
}
