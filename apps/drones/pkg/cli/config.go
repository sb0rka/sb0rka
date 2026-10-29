package cli

import (
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	defaultDatabaseURI             = "postgres://postgres:postgres@localhost:5432/platform"
	defaultDatabaseMaxConns        = 10
	defaultDatabaseConnMaxLifetime = 30 * time.Second
	defaultGCInterval              = 5 * time.Second
)

func getStringEnv(key, fallback string) string {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	return v
}

func getIntEnv(key string, fallback int) int {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}

	if val, err := strconv.Atoi(v); err != nil {
		return fallback
	} else {
		return val
	}
}

func getDurationEnv(key string, fallback time.Duration) time.Duration {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}

	if val, err := strconv.Atoi(v); err != nil {
		return fallback
	} else {
		return time.Duration(val) * time.Second
	}
}

type Config struct {
	DatabaseURI             string
	DatabaseMaxConns        int
	DatabaseConnMaxLifetime time.Duration
	GCInterval              time.Duration
}

func loadConfig() Config {
	return Config{
		DatabaseURI:             getStringEnv("DATABASE_URI", defaultDatabaseURI),
		DatabaseMaxConns:        getIntEnv("DATABASE_MAX_OPEN_CONNS", defaultDatabaseMaxConns),
		DatabaseConnMaxLifetime: getDurationEnv("DATABASE_CONN_MAX_LIFETIME_SEC", defaultDatabaseConnMaxLifetime),
		GCInterval:              getDurationEnv("GC_INTERVAL_SEC", defaultGCInterval),
	}
}
