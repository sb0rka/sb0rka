package apiapp

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/sb0rka/sb0rka/apps/api/internal/authz"
	"github.com/sb0rka/sb0rka/apps/api/internal/config"
	"github.com/sb0rka/sb0rka/apps/api/internal/logger"
	_ "github.com/sb0rka/sb0rka/apps/api/internal/openapi"
	"github.com/sb0rka/sb0rka/apps/api/internal/service"
	"github.com/sb0rka/sb0rka/apps/api/internal/store"
	"github.com/sb0rka/sb0rka/apps/api/internal/telemetry"
	"github.com/sb0rka/sb0rka/apps/api/internal/transport"
	"github.com/sb0rka/sb0rka/apps/api/pkg/account"
	"github.com/sb0rka/sb0rka/apps/api/pkg/membership"
	"github.com/sb0rka/sb0rka/apps/api/pkg/quota"
	"github.com/sb0rka/sb0rka/apps/api/pkg/route"
	coretransport "github.com/sb0rka/sb0rka/packages/core/transport"
)

type App struct {
	opts Options
}

func New(opts Options) *App {
	return &App{opts: opts}
}

func (a *App) Run(ctx context.Context) error {
	setupCtx := ctx
	if setupCtx == nil {
		setupCtx = context.Background()
	}

	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("failed to load configuration: %w", err)
	}

	log, err := logger.New(cfg.Logger)
	if err != nil {
		return fmt.Errorf("failed to initialize logger: %w", err)
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
		return fmt.Errorf("failed to initialize platform database connection: %w", err)
	}
	// After Run returns (post http.Server.Shutdown) or on setup failure — not via
	// Run's pre-Shutdown hooks, which would close the pool under in-flight requests.
	defer func() {
		log.Info("closing database connections")
		_ = platformDatabase.Close()
	}()

	if err := platformDatabase.TestConnection(setupCtx); err != nil {
		return fmt.Errorf("failed to test platform database connection: %w", err)
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
		return fmt.Errorf("failed to initialize telemetry adapter: %w", err)
	}
	telemetryService := telemetry.NewService(platformDatabase, telemetryAdapter)

	secretKeyResolver, err := service.NewTinkKeysetResolverFromJSON(
		cfg.Server.AuthConfig.SecretKeyRef,
		cfg.Server.AuthConfig.SecretTinkKeysetJSON,
	)
	if err != nil {
		return fmt.Errorf("failed to initialize secret key resolver: %w", err)
	}
	secretCrypto := service.NewTinkAEADSecretCrypto(secretKeyResolver)

	accountHook := account.Noop()
	if a.opts.AccountRepositoryFactory != nil && a.opts.AccountHookFactory != nil {
		repo := a.opts.AccountRepositoryFactory(platformDatabase.PgxPool())
		accountHook = a.opts.AccountHookFactory(repo)
	}

	quotaHook := quota.Noop()
	if a.opts.QuotaRepositoryFactory != nil && a.opts.QuotaHookFactory != nil {
		repo := a.opts.QuotaRepositoryFactory(platformDatabase.PgxPool())
		quotaHook = a.opts.QuotaHookFactory(repo)
	}

	membershipHook := membership.Noop()
	if a.opts.MembershipRepositoryFactory != nil && a.opts.MembershipHookFactory != nil {
		repo := a.opts.MembershipRepositoryFactory(platformDatabase.PgxPool())
		membershipHook = a.opts.MembershipHookFactory(repo)
	}

	var additionalRoutes []route.Route
	// Extension handlers live outside this module and cannot import internal/authz.
	// They share this audited authorizer, but only through AuthorizeProjectRead.
	authorizer := authz.NewAuditedAuthorizer(authz.NewRBACAuthorizer(platformDatabase), log)
	routeDeps := route.Dependencies{
		Pool:                 platformDatabase.PgxPool(),
		AuthorizeProjectRead: projectReadAuthorizer(authorizer),
	}
	for _, factory := range a.opts.RouteFactories {
		if factory == nil {
			return fmt.Errorf("nil API route factory")
		}
		additionalRoutes = append(additionalRoutes, factory(routeDeps)...)
	}

	newSrv := transport.NewServer(transport.Dependencies{
		PlatformDatabase: platformDatabase,
		Authorizer:       authorizer,
		SecretCrypto:     secretCrypto,
		Telemetry:        telemetryService,
		AccountHook:      accountHook,
		QuotaHook:        quotaHook,
		MembershipHook:   membershipHook,
		AdditionalRoutes: additionalRoutes,
		DefaultPlans:     a.opts.DefaultPlans.WithDefaults(),
		Cfg:              cfg.Server,
		Log:              log,
	})
	handler := newSrv.BuildCommonHandler()
	addr := fmt.Sprintf("%s:%s", cfg.Server.Addr, cfg.Server.Port)

	return coretransport.Run(ctx, addr, *handler, log)
}
