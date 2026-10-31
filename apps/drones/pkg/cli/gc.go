package cli

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/spf13/cobra"
)

func runGC(ctx context.Context, log *slog.Logger, db Database) error {
	projectID, err := db.CleanTerminatedDatabases(ctx, log)
	if err != nil {
		return err
	}
	if projectID == uuid.Nil {
		log.Debug("nothing_to_clean")
		return nil
	}
	log.Info("cleaned_successfully")
	return nil
}

func NewCmdGC() *cobra.Command {
	var once bool
	var interval time.Duration
	cmd := &cobra.Command{
		Use:   "gc",
		Short: "Clean terminated databases and password-secret metadata",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			cfg := loadConfig()
			if !cmd.Flags().Changed("interval") {
				interval = cfg.GCInterval
			}
			if interval <= 0 {
				return fmt.Errorf("interval must be positive")
			}
			ctx := cmd.Context()
			log := slog.New(slog.NewTextHandler(cmd.OutOrStdout(), &slog.HandlerOptions{Level: slog.LevelInfo}))
			log.Info("initializing drones gc")
			db, err := CreateDatabase(cfg.DatabaseURI, cfg.DatabaseMaxConns, cfg.DatabaseConnMaxLifetime)
			if err != nil {
				return fmt.Errorf("initialize database connection: %w", err)
			}
			defer func() { _ = db.Close() }()
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
				if err := ctx.Err(); err != nil {
					return err
				}
				if err := runGC(ctx, log, db); err != nil {
					log.Error("gc iteration failed", "error", err)
				}
				select {
				case <-ctx.Done():
					log.Info("shutdown signal received, stopping drones gc")
					return ctx.Err()
				case <-ticker.C:
				}
			}
		},
	}
	cmd.Flags().BoolVar(&once, "once", false, "Run one GC iteration and exit")
	cmd.Flags().DurationVar(&interval, "interval", getDurationEnv("GC_INTERVAL_SEC", defaultGCInterval), "GC interval")
	return cmd
}
