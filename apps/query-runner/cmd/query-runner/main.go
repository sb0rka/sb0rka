package main

import (
	"log"
	"log/slog"
	"net/http"
	"os"

	"github.com/aws/aws-lambda-go/lambda"
	"github.com/sb0rka/sb0rka/apps/query-runner/internal/config"
	"github.com/sb0rka/sb0rka/apps/query-runner/internal/platform"
	"github.com/sb0rka/sb0rka/apps/query-runner/internal/query"
	"github.com/sb0rka/sb0rka/apps/query-runner/internal/runner"
)

func initLogging() {
	opts := &slog.HandlerOptions{Level: slog.LevelInfo}
	if os.Getenv("AWS_LAMBDA_RUNTIME_API") != "" {
		slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stderr, opts)))
		return
	}
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stderr, opts)))
}

func main() {
	initLogging()

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config_failed: %v", err)
	}

	platformClient, err := platform.NewClient(cfg.PlatformAPIBaseURL, cfg.PlatformTimeout)
	if err != nil {
		log.Fatalf("platform_client_failed: %v", err)
	}

	service := runner.NewService(
		platformClient,
		&query.Executor{
			ConnectTimeout:        cfg.ConnectTimeout,
			QueryTimeout:          cfg.QueryTimeout,
			MaxRows:               cfg.MaxRows,
			MaxResponseBytes:      cfg.MaxResponseBytes,
			DangerAllowAllQueries: cfg.DangerAllowAllQueries,
		},
		runner.NewLimiter(cfg.RateLimitRPS, cfg.RateLimitBurst),
	)
	if cfg.DangerAllowAllQueries {
		log.Print("query_runner_danger_allow_all_queries enabled=true")
	}

	if os.Getenv("AWS_LAMBDA_RUNTIME_API") != "" {
		lambda.Start(service.HandleLambda)
		return
	}

	log.Printf("query_runner_listening addr=%s", cfg.HTTPListenAddr)
	if err := http.ListenAndServe(cfg.HTTPListenAddr, service); err != nil {
		log.Fatalf("query_runner_failed: %v", err)
	}
}
