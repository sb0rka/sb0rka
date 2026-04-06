package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

const (
	configFileName = "config.json"
	configDirName  = ".s0c"
)

// Config holds CLI defaults stored next to the auth file (~/.s0c/config.json).
type Config struct {
	DatabaseID string `json:"database_id,omitempty"`
	ProjectID  string `json:"project_id,omitempty"`
}

func ConfigDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve home dir: %w", err)
	}

	return filepath.Join(home, configDirName), nil
}

func Path() (string, error) {
	dir, err := ConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, configFileName), nil
}

func Load() (Config, error) {
	p, err := Path()
	if err != nil {
		return Config{}, err
	}
	data, err := os.ReadFile(p)
	if err != nil {
		if os.IsNotExist(err) {
			return Config{}, nil
		}
		return Config{}, fmt.Errorf("read config: %w", err)
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return Config{}, fmt.Errorf("decode config: %w", err)
	}
	return cfg, nil
}

func Save(cfg Config) error {
	configDir, err := ConfigDir()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(configDir, 0o700); err != nil {
		return fmt.Errorf("create config dir: %w", err)
	}

	outPath := filepath.Join(configDir, configFileName)
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("encode config: %w", err)
	}
	data = append(data, '\n')

	tmpFile, err := os.CreateTemp(configDir, "config-*.tmp")
	if err != nil {
		return fmt.Errorf("create temp config file: %w", err)
	}
	tmpPath := tmpFile.Name()
	defer func() { _ = os.Remove(tmpPath) }()

	if err := tmpFile.Chmod(0o600); err != nil {
		_ = tmpFile.Close()
		return fmt.Errorf("chmod temp config file: %w", err)
	}
	if _, err := tmpFile.Write(data); err != nil {
		_ = tmpFile.Close()
		return fmt.Errorf("write temp config file: %w", err)
	}
	if err := tmpFile.Sync(); err != nil {
		_ = tmpFile.Close()
		return fmt.Errorf("sync temp config file: %w", err)
	}
	if err := tmpFile.Close(); err != nil {
		return fmt.Errorf("close temp config file: %w", err)
	}

	if err := os.Rename(tmpPath, outPath); err != nil {
		return fmt.Errorf("replace config file: %w", err)
	}

	return nil
}
