package transport

import (
	"net/http"

	httpSwagger "github.com/swaggo/http-swagger/v2"

	tdbis "github.com/sb0rka/sb0rka/apps/api/internal/transport/dbis"
	tiam "github.com/sb0rka/sb0rka/apps/api/internal/transport/iam"
	tprojects "github.com/sb0rka/sb0rka/apps/api/internal/transport/projects"
	tresources "github.com/sb0rka/sb0rka/apps/api/internal/transport/resources"
	"github.com/sb0rka/sb0rka/apps/api/internal/transport/runtime"
	tsecrets "github.com/sb0rka/sb0rka/apps/api/internal/transport/secrets"
	ttags "github.com/sb0rka/sb0rka/apps/api/internal/transport/tags"
	ttelemetry "github.com/sb0rka/sb0rka/apps/api/internal/transport/telemetry"
)

type Dependencies = runtime.Dependencies

type Server struct {
	deps      runtime.Dependencies
	iam       *tiam.Handler
	projects  *tprojects.Handler
	dbis      *tdbis.Handler
	resources *tresources.Handler
	secrets   *tsecrets.Handler
	tags      *ttags.Handler
	telemetry *ttelemetry.Handler
}

func NewServer(deps runtime.Dependencies) *Server {
	return &Server{
		deps:      deps,
		iam:       tiam.NewHandler(deps),
		projects:  tprojects.NewHandler(deps),
		dbis:      tdbis.NewHandler(deps),
		resources: tresources.NewHandler(deps),
		secrets:   tsecrets.NewHandler(deps),
		tags:      ttags.NewHandler(deps),
		telemetry: ttelemetry.NewHandler(deps),
	}
}

func (s *Server) BuildCommonHandler() *http.Handler {
	mux := http.NewServeMux()
	authOnly := func(h http.HandlerFunc) http.Handler {
		return s.authMiddleware(h)
	}
	authLive := func(h http.HandlerFunc) http.Handler {
		return s.authMiddleware(s.requireLiveSessionMiddleware(h))
	}

	mux.HandleFunc("GET /ping", s.ping)
	mux.HandleFunc("GET /health", s.health)
	mux.HandleFunc("GET /plans", s.iam.ListPublicPlans)

	// Swagger UI (публичный)
	mux.Handle("GET /swagger/", httpSwagger.Handler(httpSwagger.URL("/swagger/doc.json")))

	// Plans & quotas

	mux.Handle("GET /plan", authOnly(s.iam.GetAccountPlan))
	mux.Handle("POST /account/initialize", authLive(s.iam.InitializeAccount))
	mux.Handle("GET /account/plan", authOnly(s.iam.GetAccountPlan))
	mux.Handle("GET /projects/{project_id}/plan", authOnly(s.iam.GetProjectPlan))
	mux.Handle("GET /projects/{project_id}/quotas", authOnly(s.iam.GetProjectQuotas))
	mux.Handle("GET /projects/{project_id}/usage", authOnly(s.iam.GetProjectUsage))

	// Projects
	mux.Handle("POST /projects", authLive(s.projects.CreateProject))
	mux.Handle("GET /projects", authOnly(s.projects.ListProjects))
	mux.Handle("GET /projects/{project_id}", authOnly(s.projects.GetProject))
	mux.Handle("PATCH /projects/{project_id}", authLive(s.projects.UpdateProject))
	mux.Handle("DELETE /projects/{project_id}", authLive(s.projects.DeleteProject))

	// Project members
	mux.Handle("GET /projects/{project_id}/members", authOnly(s.projects.ListProjectMembers))
	mux.Handle("POST /projects/{project_id}/members", authLive(s.projects.AddProjectMember))
	mux.Handle("GET /projects/{project_id}/members/{subject_id}", authOnly(s.projects.GetProjectMember))
	mux.Handle("PATCH /projects/{project_id}/members/{subject_id}", authLive(s.projects.UpdateProjectMemberRole))
	mux.Handle("DELETE /projects/{project_id}/members/{subject_id}", authLive(s.projects.RemoveProjectMember))

	// Resources
	mux.Handle("GET /projects/{project_id}/resources", authOnly(s.resources.ListResources))

	// Database instances
	mux.Handle("POST /projects/{project_id}/dbi", authLive(s.dbis.CreateDBInstance))
	mux.Handle("GET /projects/{project_id}/dbis", authOnly(s.dbis.ListDBInstances))
	mux.Handle("GET /projects/{project_id}/resources/{resource_id}/dbi", authOnly(s.dbis.GetDBInstance))
	mux.Handle("PATCH /projects/{project_id}/resources/{resource_id}/dbi", authLive(s.dbis.UpdateDBInstance))
	mux.Handle("POST /projects/{project_id}/resources/{resource_id}/dbi/state/start", authLive(s.dbis.StartDBInstance))
	mux.Handle("POST /projects/{project_id}/resources/{resource_id}/dbi/state/stop", authLive(s.dbis.StopDBInstance))
	mux.Handle("GET /projects/{project_id}/resources/{resource_id}/dbi/connection/direct", authOnly(s.dbis.GetDBInstanceConnection))
	mux.Handle("POST /projects/{project_id}/resources/{resource_id}/dbi/uri/direct/reveal", authLive(s.dbis.RevealDBInstanceURI))
	mux.Handle("DELETE /projects/{project_id}/resources/{resource_id}/dbi", authLive(s.dbis.DeleteDBInstance))

	// Telemetry
	mux.Handle("GET /projects/{project_id}/resources/{resource_id}/observability/metrics/timeseries", authOnly(s.telemetry.GetResourceMetricTimeseries))

	// Secrets
	mux.Handle("POST /projects/{project_id}/secret", authLive(s.secrets.CreateSecret))
	mux.Handle("GET /projects/{project_id}/secrets", authOnly(s.secrets.ListSecrets))
	mux.Handle("GET /projects/{project_id}/resources/{resource_id}/secret", authOnly(s.secrets.GetSecret))
	mux.Handle("POST /projects/{project_id}/resources/{resource_id}/secret/reveal", authLive(s.secrets.RevealSecret))
	mux.Handle("PATCH /projects/{project_id}/resources/{resource_id}/secret", authLive(s.secrets.UpdateSecret))
	mux.Handle("GET /projects/{project_id}/resources/{resource_id}/secret/versions", authOnly(s.secrets.ListSecretVersions))
	mux.Handle("GET /projects/{project_id}/resources/{resource_id}/secret/versions/{version_no}", authOnly(s.secrets.GetSecretVersion))
	mux.Handle("POST /projects/{project_id}/resources/{resource_id}/secret/versions", authLive(s.secrets.CreateSecretVersion))
	mux.Handle("POST /projects/{project_id}/resources/{resource_id}/secret/versions/{version_no}/reveal", authLive(s.secrets.RevealSecretVersion))
	mux.Handle("POST /projects/{project_id}/resources/{resource_id}/secret/versions/{version_no}/verifier/apply", authLive(s.secrets.ApplySecretVersionPasswordVerifier))
	mux.Handle("POST /projects/{project_id}/resources/{resource_id}/secret/versions/{version_no}/disable", authLive(s.secrets.DisableSecretVersion))
	mux.Handle("DELETE /projects/{project_id}/resources/{resource_id}/secret", authLive(s.secrets.DeleteSecret))

	// Tags
	mux.Handle("GET /projects/{project_id}/tags", authOnly(s.tags.ListProjectTags))
	mux.Handle("GET /projects/{project_id}/resources/{resource_id}/tags", authOnly(s.tags.ListResourceTags))
	mux.Handle("POST /projects/{project_id}/resources/{resource_id}/tag", authLive(s.tags.AttachResourceTag))
	mux.Handle("DELETE /projects/{project_id}/resources/{resource_id}/tags/{tag_id}/detach", authLive(s.tags.DetachResourceTag))

	commonHandler := s.loggerMiddleware(mux)
	commonHandler = s.corsMiddleware(commonHandler)
	commonHandler = s.panicMiddleware(commonHandler)

	return &commonHandler
}
