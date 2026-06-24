package config

import "time"

type LoggerConfig struct {
	Level  string
	Format string
}

type DatabaseConfig struct {
	URI             string
	MaxConns        int
	ConnMaxLifetime time.Duration
}
