package auth

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/sb0rka/sb0rka/apps/s0c/internal/config"
)

const (
	authFileName = "auth.json"
)

func AuthFilePath() (string, error) {
	dir, err := config.ConfigDir()
	if err != nil {
		return "", err
	}

	return filepath.Join(dir, authFileName), nil
}

func LoadState() (AuthState, error) {
	authPath, err := AuthFilePath()
	if err != nil {
		return AuthState{}, err
	}

	data, err := os.ReadFile(authPath)
	if err != nil {
		return AuthState{}, err
	}

	var state AuthState
	if err := json.Unmarshal(data, &state); err != nil {
		return AuthState{}, fmt.Errorf("decode auth state: %w", err)
	}

	return state, nil
}

func SaveState(state AuthState) error {
	configDir, err := config.ConfigDir()
	if err != nil {
		return err
	}

	if err := os.MkdirAll(configDir, 0o700); err != nil {
		return fmt.Errorf("create config dir: %w", err)
	}

	authPath := filepath.Join(configDir, authFileName)

	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return fmt.Errorf("encode auth state: %w", err)
	}
	data = append(data, '\n')

	tmpFile, err := os.CreateTemp(configDir, "auth-*.tmp")
	if err != nil {
		return fmt.Errorf("create temp auth file: %w", err)
	}
	tmpPath := tmpFile.Name()
	defer func() {
		_ = os.Remove(tmpPath)
	}()

	if err := tmpFile.Chmod(0o600); err != nil {
		_ = tmpFile.Close()
		return fmt.Errorf("chmod temp auth file: %w", err)
	}
	if _, err := tmpFile.Write(data); err != nil {
		_ = tmpFile.Close()
		return fmt.Errorf("write temp auth file: %w", err)
	}
	if err := tmpFile.Sync(); err != nil {
		_ = tmpFile.Close()
		return fmt.Errorf("sync temp auth file: %w", err)
	}
	if err := tmpFile.Close(); err != nil {
		return fmt.Errorf("close temp auth file: %w", err)
	}

	if err := os.Rename(tmpPath, authPath); err != nil {
		return fmt.Errorf("replace auth state file: %w", err)
	}

	return nil
}
