package config

import (
	"errors"
	"os"
	"strings"
)

const minimumInvestigationAgentExchangeSecretLen = 32

func loadOptionalInvestigationAgentExchangeConfig() (*InvestigationAgentExchangeConfig, error) {
	clientID := strings.TrimSpace(os.Getenv("INVESTIGATION_AGENT_EXCHANGE_CLIENT_ID"))
	clientSecret := []byte(os.Getenv("INVESTIGATION_AGENT_EXCHANGE_CLIENT_SECRET"))
	if clientID == "" && len(clientSecret) == 0 {
		return nil, nil
	}
	if clientID == "" || len(clientSecret) == 0 {
		return nil, errors.New("INVESTIGATION_AGENT_EXCHANGE_CLIENT_ID and INVESTIGATION_AGENT_EXCHANGE_CLIENT_SECRET must be set together")
	}
	if len(clientID) > 128 {
		return nil, errors.New("INVESTIGATION_AGENT_EXCHANGE_CLIENT_ID must be at most 128 bytes")
	}
	if len(clientSecret) < minimumInvestigationAgentExchangeSecretLen {
		return nil, errors.New("INVESTIGATION_AGENT_EXCHANGE_CLIENT_SECRET must be at least 32 bytes")
	}
	return &InvestigationAgentExchangeConfig{ClientID: clientID, ClientSecret: clientSecret}, nil
}
