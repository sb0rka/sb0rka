package main

import (
	"context"
	_ "embed"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/sb0rka/sb0rka/apps/api/internal/authz"
	"github.com/sb0rka/sb0rka/apps/api/internal/config"
	"github.com/sb0rka/sb0rka/apps/api/internal/logger"
	"github.com/sb0rka/sb0rka/apps/api/internal/service"
	"github.com/sb0rka/sb0rka/apps/api/internal/store"
	"github.com/sb0rka/sb0rka/apps/api/internal/telemetry"
	"github.com/sb0rka/sb0rka/apps/api/internal/transport"

	// Регистрирует сгенерированную OpenAPI-спеку для Swagger UI.
	_ "github.com/sb0rka/sb0rka/apps/api/internal/openapi"
)

//go:embed version.txt
var versionFile string

var APIVersion = strings.TrimSpace(versionFile)

func serverCMD(args []string) error {
	fs := flag.NewFlagSet("server", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)

	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() != 0 {
		return fmt.Errorf("server cmd got unexpected arguments: %v", fs.Args())
	}

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

	secretKeyResolver, err := service.NewTinkKeysetResolverFromJSON(
		cfg.Server.AuthConfig.SecretKeyRef,
		cfg.Server.AuthConfig.SecretTinkKeysetJSON,
	)
	if err != nil {
		return fmt.Errorf("failed to initialize secret key resolver: %v", err)
	}
	secretCrypto := service.NewTinkAEADSecretCrypto(secretKeyResolver)

	newSrv := transport.NewServer(transport.Dependencies{
		PlatformDatabase: platformDatabase,
		Authorizer:       authz.NewRBACAuthorizer(platformDatabase),
		SecretCrypto:     secretCrypto,
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

func secretKeyCMD(args []string) error {
	fs := flag.NewFlagSet("secret-key", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)

	keysetJSON, err := service.GenerateTinkAEADKeysetJSON()
	if err != nil {
		return fmt.Errorf("failed to generate tink keyset: %w", err)
	}
	fmt.Printf("SECRET_TINK_KEYSET_JSON=%s\n", keysetJSON)

	return nil
}

func versionCMD(args []string) error {
	fs := flag.NewFlagSet("version", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)

	if err := fs.Parse(args); err != nil {
		return err
	}

	_, err := fmt.Fprintln(os.Stdout, APIVersion)
	return err
}

func usageCMD(w *os.File) {
	fmt.Fprintln(w, "Usage: api <command> [flags]")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Commands:")
	fmt.Fprintln(w, "  gen-secret-key     Generate secret key")
	fmt.Fprintln(w, "  server    Run API server")
	fmt.Fprintln(w, "  version   Print api version")
}

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

// @title           Sb0rka Platform API
// @version          0.1.0
// @description      REST API платформы Sb0rka: проекты, базы данных, секреты, теги.
// @BasePath         /
// @securityDefinitions.apikey  BearerAuth
// @in               header
// @name             Authorization
func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}
