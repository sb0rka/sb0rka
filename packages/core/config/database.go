package config

import "time"

const (
	DefaultDatabaseMaxConns        = 10
	DefaultDatabaseConnMaxLifetime = 30 * time.Second
)
