package main

import (
	"context"
	_ "embed"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	defaultPlatformDatabaseURI     = "postgres://postgres:postgres@localhost:5432/platform"
	defaultDatabaseMaxConns        = 10
	defaultDatabaseConnMaxLifetime = 30 * time.Second
	defaultGCInterval              = 5 * time.Second
)

//go:embed version.txt
var versionFile string

var DronesVersion = strings.TrimSpace(versionFile)

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
	PlatformDatabaseURI     string
	DatabaseMaxConns        int
	DatabaseConnMaxLifetime time.Duration
	GCInterval              time.Duration
}

func loadConfig() Config {
	return Config{
		PlatformDatabaseURI:     getStringEnv("PLATFORM_DATABASE_URI", defaultPlatformDatabaseURI),
		DatabaseMaxConns:        getIntEnv("DATABASE_MAX_OPEN_CONNS", defaultDatabaseMaxConns),
		DatabaseConnMaxLifetime: getDurationEnv("DATABASE_CONN_MAX_LIFETIME_SEC", defaultDatabaseConnMaxLifetime),
		GCInterval:              getDurationEnv("GC_INTERVAL_SEC", defaultGCInterval),
	}
}

func CreateDatabase(uri string, maxConns int, connMaxLifetime time.Duration) (Database, error) {
	return NewPsqlDB(uri, maxConns, connMaxLifetime)
}

type Database interface {
	TestConnection(ctx context.Context) error

	Close() error

	CleanTerminatedDatabases(ctx context.Context, log *slog.Logger) (string, error)
}

type PsqlDB struct {
	pool *pgxpool.Pool
}

func NewPsqlDB(uri string, maxConns int, connMaxLifetime time.Duration) (*PsqlDB, error) {
	cfg, err := pgxpool.ParseConfig(uri)
	if err != nil {
		return nil, err
	}

	if maxConns > 0 {
		cfg.MaxConns = int32(maxConns)
	}
	if connMaxLifetime > 0 {
		cfg.MaxConnLifetime = connMaxLifetime
	}

	pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		return nil, err
	}

	return &PsqlDB{pool: pool}, nil
}

func (p *PsqlDB) TestConnection(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	return p.pool.Ping(ctx)
}

type cleanupTarget struct {
	ProjectID  string
	DatabaseID string
	SecretID   string
	TagID      int64
}

func (p *PsqlDB) cleanupOneDeletedDBI(ctx context.Context) (cleanupTarget, bool, error) {
	const query = `
		SELECT project_id, database_id, secret_id, tag_id
		FROM api.cleanup_one_deleted_dbi()
	`

	var target cleanupTarget
	err := p.pool.QueryRow(ctx, query).Scan(&target.ProjectID, &target.DatabaseID, &target.SecretID, &target.TagID)
	if err == pgx.ErrNoRows {
		return cleanupTarget{}, false, nil
	}
	if err != nil {
		return cleanupTarget{}, false, err
	}
	return target, true, nil
}

func (p *PsqlDB) CleanTerminatedDatabases(ctx context.Context, log *slog.Logger) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	target, found, err := p.cleanupOneDeletedDBI(ctx)
	if err != nil {
		return "", err
	}
	if !found {
		return "", nil
	}

	log.Info("cleaned_resources", "project_id", target.ProjectID, "database_id", target.DatabaseID, "secret_id", target.SecretID, "tag_id", target.TagID)
	return target.ProjectID, nil
}

func (p *PsqlDB) Close() error {
	if p.pool != nil {
		p.pool.Close()
	}
	return nil
}

func runGC(ctx context.Context, log *slog.Logger, db Database) error {
	projectID, err := db.CleanTerminatedDatabases(ctx, log)
	if err != nil {
		return err
	}

	if projectID == "" {
		log.Debug("nothing_to_clean")
		return nil
	}

	log.Info("cleaned_successfully")

	return nil
}

func gcCMD(args []string) error {
	fs := flag.NewFlagSet("gc", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)

	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	log.Info("initializing drones gc")

	cfg := loadConfig()
	interval := cfg.GCInterval
	once := false

	fs.DurationVar(&interval, "interval", interval, "gc interval")
	fs.BoolVar(&once, "once", false, "run one gc iteration and exit")
	if err := fs.Parse(args); err != nil {
		return err
	}

	if interval <= 0 {
		return fmt.Errorf("interval must be positive")
	}

	db, err := CreateDatabase(
		cfg.PlatformDatabaseURI,
		cfg.DatabaseMaxConns,
		cfg.DatabaseConnMaxLifetime,
	)
	if err != nil {
		return fmt.Errorf("initialize database connection: %w", err)
	}
	defer db.Close()

	if err := db.TestConnection(ctx); err != nil {
		return fmt.Errorf("test database connection: %w", err)
	}
	log.Info("database connection established successfully")

	if once {
		return runGC(ctx, log, db)
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	log.Info("drone_gc_started", "interval", interval.String())
	for {
		if err := runGC(ctx, log, db); err != nil {
			log.Error("gc iteration failed", "error", err)
		}

		select {
		case <-ctx.Done():
			log.Info("shutdown signal received, stopping drones gc")
			return nil
		case <-ticker.C:
			log.Info("tick")
		}
	}
}

func versionCMD(args []string) error {
	fs := flag.NewFlagSet("version", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)

	if err := fs.Parse(args); err != nil {
		return err
	}

	_, err := fmt.Fprintln(os.Stdout, DronesVersion)
	return err
}

func usageCMD(w *os.File) {
	fmt.Fprintln(w, "Usage: drones <command> [flags]")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Commands:")
	fmt.Fprintln(w, "  gc   GC terminated DB and password-secret metadata")
	fmt.Fprintln(w, "  version      Print drones version")
}

func run(args []string) error {
	if len(args) == 0 {
		usageCMD(os.Stderr)
		return flag.ErrHelp
	}

	switch args[0] {
	case "gc":
		return gcCMD(args[1:])
	case "version":
		return versionCMD(args[1:])
	case "-h", "--help", "help":
		usageCMD(os.Stdout)
		return nil
	default:
		usageCMD(os.Stderr)
		return fmt.Errorf("unknown command %q", args[0])
	}
}

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}
