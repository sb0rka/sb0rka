package config

import (
	"encoding/json"
	"strings"
	"testing"

	coreauth "github.com/sb0rka/sb0rka/packages/core/auth"
)

func TestRegistryFromPoliciesAcceptsDistinctClients(t *testing.T) {
	registry, skipped, err := RegistryFromPolicies(mustPolicies(t, validPolicies()), false, lookupSecrets(testSecretValues()))
	if err != nil {
		t.Fatal(err)
	}
	if len(registry.Clients) != 6 || len(skipped) != 0 || registry.Digest == "" {
		t.Fatalf("clients=%d skipped=%d digest=%q", len(registry.Clients), len(skipped), registry.Digest)
	}

	secrets := testSecretValues()
	delete(secrets, "SB0RKA_IR_GATEWAY_CLIENT_SECRET")
	registry, skipped, err = RegistryFromPolicies(mustPolicies(t, validPolicies()), false, lookupSecrets(secrets))
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := registry.Client("sb0rka-ir-gateway"); ok || len(registry.Clients) != 5 || len(skipped) != 1 {
		t.Fatalf("clients=%d skipped=%d gateway initialized", len(registry.Clients), len(skipped))
	}
	if skipped[0].ClientID != "sb0rka-ir-gateway" || skipped[0].SecretEnv != "SB0RKA_IR_GATEWAY_CLIENT_SECRET" {
		t.Fatalf("skipped=%+v", skipped[0])
	}
}

func TestRegistryFromPoliciesRejectsUnsafePolicy(t *testing.T) {
	cases := []struct {
		name string
		body string
	}{
		{
			"duplicate access audience",
			strings.Replace(validPolicies(), `"access_audience":"sb0rka-ir"`, `"access_audience":"sb0rka-som"`, 1),
		},
		{
			"relay access audience",
			strings.Replace(validPolicies(), `"access_audience":"sb0rka-som"`, `"access_audience":"sb0rka-relay"`, 1),
		},
		{
			"foreign introspection",
			strings.Replace(validPolicies(), `"introspection_audiences":["sb0rka-ir"]`, `"introspection_audiences":["sb0rka-som"]`, 1),
		},
		{
			"gateway introspects login audience",
			strings.Replace(
				validPolicies(),
				`"introspection_audiences":["sb0rka-ir-gateway"]`,
				`"introspection_audiences":["sb0rka-ir"]`,
				1,
			),
		},
		{
			"retired bootstrap scope on ir",
			strings.Replace(
				validPolicies(),
				`["projects.read","resources.read"]`,
				`["projects.read","som.bootstrap.manage"]`,
				1,
			),
		},
		{"invalid actor", strings.Replace(validPolicies(), `"service_actor":"ir-service"`, `"service_actor":"IR_Service"`, 1)},
		{"shared delegation actor", strings.Replace(validPolicies(), `"service_actor":"ir-service"`, `"service_actor":"som-service"`, 1)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, _, err := RegistryFromPolicies(mustPolicies(t, tc.body), false, lookupSecrets(testSecretValues())); err == nil {
				t.Fatal("expected rejection")
			}
		})
	}
}

func mustPolicies(t *testing.T, body string) []coreauth.ClientPolicy {
	t.Helper()
	var policies []coreauth.ClientPolicy
	if err := json.Unmarshal([]byte(body), &policies); err != nil {
		t.Fatal(err)
	}
	return policies
}

func testSecretValues() map[string]string {
	return map[string]string{
		"SB0RKA_SOM_WEB_CLIENT_SECRET":      strings.Repeat("a", 32),
		"SB0RKA_IR_WEB_CLIENT_SECRET":       strings.Repeat("b", 32),
		"SB0RKA_SOM_WORKLOAD_CLIENT_SECRET": strings.Repeat("c", 32),
		"SB0RKA_IR_GATEWAY_CLIENT_SECRET":   strings.Repeat("d", 32),
		"SB0RKA_SOM_ATTESTATION_SECRET":     strings.Repeat("e", 32),
	}
}

func lookupSecrets(values map[string]string) func(string) (string, bool) {
	return func(name string) (string, bool) {
		value, ok := values[name]
		return value, ok
	}
}

func validPolicies() string {
	return `[
    {
      "client_id":"sb0rka-console","name":"Console","enabled":true,"type":"internal",
      "grant_types":[],"access_audience":"sb0rka-api"
    },
    {
      "client_id":"sb0rka-consent","name":"Consent","enabled":true,"type":"internal",
      "grant_types":[],"access_audience":"sb0rka-api"
    },
    {
      "client_id":"sb0rka-som-web","name":"SoM","enabled":true,"type":"confidential",
      "secret_env":"SB0RKA_SOM_WEB_CLIENT_SECRET",
      "grant_types":["authorization_code","refresh_token","urn:ietf:params:oauth:grant-type:token-exchange","urn:sb0rka:params:oauth:grant-type:delegation"],
      "redirect_uris":["http://localhost:3000/callback"],
      "oidc_scopes":["openid","profile","email","offline_access"],
      "access_audience":"sb0rka-som","service_actor":"som-service",
      "delegation_policies":{"sb0rka-api":["projects.read","resources.read","secrets.create","secrets.write"]}
    },
    {
      "client_id":"sb0rka-ir-web","name":"IR","enabled":true,"type":"confidential",
      "secret_env":"SB0RKA_IR_WEB_CLIENT_SECRET",
      "grant_types":["authorization_code","refresh_token","urn:ietf:params:oauth:grant-type:token-exchange","urn:sb0rka:params:oauth:grant-type:delegation"],
      "redirect_uris":["http://localhost:8090/callback"],
      "oidc_scopes":["openid","offline_access"],
      "access_audience":"sb0rka-ir","service_actor":"ir-service",
      "delegation_policies":{"sb0rka-api":["projects.read","resources.read"],"sb0rka-ir-gateway":["ir.gateway.use"]},
      "introspection_audiences":["sb0rka-ir"]
    },
    {
      "client_id":"sb0rka-som-workload","name":"Workload","enabled":true,"type":"confidential",
      "secret_env":"SB0RKA_SOM_WORKLOAD_CLIENT_SECRET",
      "grant_types":["urn:sb0rka:params:oauth:grant-type:agent"],
      "service_actor":"som-service","can_attest":true,
      "attestation_consume_url":"https://som.sb0rka.internal/consume",
      "attestation_secret_env":"SB0RKA_SOM_ATTESTATION_SECRET"
    },
    {
      "client_id":"sb0rka-ir-gateway","name":"Gateway","enabled":true,"type":"confidential",
      "secret_env":"SB0RKA_IR_GATEWAY_CLIENT_SECRET",
      "grant_types":[],"introspection_audiences":["sb0rka-ir-gateway"]
    }
  ]`
}
