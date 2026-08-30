package config

import "testing"

func TestLoadOptionalInvestigationAgentExchangeConfig(t *testing.T) {
	t.Setenv("INVESTIGATION_AGENT_EXCHANGE_CLIENT_ID", "")
	t.Setenv("INVESTIGATION_AGENT_EXCHANGE_CLIENT_SECRET", "")
	if cfg, err := loadOptionalInvestigationAgentExchangeConfig(); err != nil || cfg != nil {
		t.Fatalf("disabled config=%#v err=%v", cfg, err)
	}

	t.Setenv("INVESTIGATION_AGENT_EXCHANGE_CLIENT_ID", "ir-api")
	if _, err := loadOptionalInvestigationAgentExchangeConfig(); err == nil {
		t.Fatal("partial configuration was accepted")
	}
	t.Setenv("INVESTIGATION_AGENT_EXCHANGE_CLIENT_SECRET", "short")
	if _, err := loadOptionalInvestigationAgentExchangeConfig(); err == nil {
		t.Fatal("short client secret was accepted")
	}
	t.Setenv("INVESTIGATION_AGENT_EXCHANGE_CLIENT_SECRET", "01234567890123456789012345678901")
	cfg, err := loadOptionalInvestigationAgentExchangeConfig()
	if err != nil || cfg == nil || cfg.ClientID != "ir-api" {
		t.Fatalf("valid config=%#v err=%v", cfg, err)
	}
}
