package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/sb0rka/sb0rka/apps/api/internal/config"
	"github.com/sb0rka/sb0rka/apps/api/internal/logger"
	"github.com/sb0rka/sb0rka/apps/api/internal/store"
	"github.com/sb0rka/sb0rka/apps/api/internal/telemetry"
	"github.com/sb0rka/sb0rka/apps/api/internal/transport"

	"golang.org/x/crypto/chacha20poly1305"
)

const APIServerVersion = "0.0.1"

func runServer() error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("failed to load configuration: %v", err)
	}

	log, err := logger.New(cfg.Logger)
	if err != nil {
		return fmt.Errorf("failed to initialize logger: %v", err)
	}
	slog.SetDefault(log)
	log.Info("logger initialized")

	log.Info("initializing database connections")
	platformDatabase, err := store.CreateDatabase(
		cfg.PlatformDatabase.URI,
		cfg.PlatformDatabase.MaxConns,
		int64(cfg.PlatformDatabase.ConnMaxLifetime),
	)
	if err != nil {
		return fmt.Errorf("failed to initialize platform database connection: %v", err)
	}

	if err := platformDatabase.TestConnection(context.Background()); err != nil {
		return fmt.Errorf("failed to test platform database connection: %v", err)
	}
	log.Info("platform database connection established successfully")

	telemetryAdapter, err := telemetry.NewPrometheusInfraAdapter(platformDatabase, telemetry.AdapterConfig{
		PrometheusURI:          cfg.Server.Telemetry.PrometheusURI,
		PrometheusQueryTimeout: cfg.Server.Telemetry.PrometheusQueryTimeout,
		PrometheusUsername:     cfg.Server.Telemetry.PrometheusUsername,
		PrometheusPassword:     cfg.Server.Telemetry.PrometheusPassword,
		PrometheusBearerToken:  cfg.Server.Telemetry.PrometheusBearerToken,
	})
	if err != nil {
		return fmt.Errorf("failed to initialize telemetry adapter: %v", err)
	}
	telemetryService := telemetry.NewService(platformDatabase, telemetryAdapter)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	newSrv := transport.NewServer(transport.Dependencies{
		PlatformDatabase: platformDatabase,
		Telemetry:        telemetryService,
		Cfg:              cfg.Server,
		Log:              log,
	})
	commonHandler := newSrv.BuildCommonHandler()
	srv := &http.Server{
		Addr:    fmt.Sprintf("%s:%s", cfg.Server.Addr, cfg.Server.Port),
		Handler: *commonHandler,
	}

	go func() {
		log.Info("starting HTTP server", "addr", cfg.Server.Addr, "port", cfg.Server.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Error("server error", "error", err)
		}
	}()

	<-ctx.Done()
	log.Info("received shutdown signal, starting graceful shutdown")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	log.Info("closing database connections")
	platformDatabase.Close()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("server shutdown error: %v", err)
	}

	log.Info("server shutdown completed successfully")

	return nil
}

func serverCMD(args []string) error {
	fs := flag.NewFlagSet("server", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)

	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() != 0 {
		return fmt.Errorf("server cmd got unexpected arguments: %v", fs.Args())
	}

	return runServer()
}

func runSecretKey() error {
	key := make([]byte, chacha20poly1305.KeySize)
	if _, err := rand.Read(key); err != nil {
		return fmt.Errorf("failed to generate secret key: %w", err)
	}

	// Return Base64 encoded secret key
	fmt.Printf("SECRET_MASTER_KEY=%s\n", base64.RawStdEncoding.EncodeToString(key))

	return nil
}

func secretKeyCMD(args []string) error {
	fs := flag.NewFlagSet("secret-key", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)

	return runSecretKey()
}

func versionCMD(args []string) error {
	fs := flag.NewFlagSet("version", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)

	return fmt.Errorf("server version: %s", APIServerVersion)
}

func usageCMD(w *os.File) {
	fmt.Fprintln(w, "Use one of command: gen-secret-key, server, version")
}

// run routes top-level CLI arguments to the appropriate subcommand handler.
func run(args []string) error {
	if len(args) == 0 {
		usageCMD(os.Stderr)
		return flag.ErrHelp
	}

	switch args[0] {
	case "gen-secret-key":
		return secretKeyCMD(args[1:])
	case "server":
		return serverCMD(args[1:])
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
