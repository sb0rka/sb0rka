package config

import "testing"

func TestLoadDangerAllowAllQueries(t *testing.T) {
	t.Setenv("PLATFORM_API_BASE_URL", "https://api.sb0rka.ru/projects/")
	t.Setenv("DANGER_ALLOW_ALL_QUERIES", "true")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	if cfg.PlatformAPIBaseURL != "https://api.sb0rka.ru/projects" {
		t.Fatalf("expected trimmed platform URL, got %q", cfg.PlatformAPIBaseURL)
	}
	if !cfg.DangerAllowAllQueries {
		t.Fatal("expected danger mode to be enabled")
	}
}

func TestLoadDangerAllowAllQueriesDefaultsToFalse(t *testing.T) {
	t.Setenv("PLATFORM_API_BASE_URL", "https://api.sb0rka.ru")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	if cfg.DangerAllowAllQueries {
		t.Fatal("expected danger mode to default to false")
	}
}
