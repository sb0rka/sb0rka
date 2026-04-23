package transport

import (
	"net/http"

	tdatabases "github.com/sb0rka/sb0rka/apps/api/internal/transport/databases"
	tiam "github.com/sb0rka/sb0rka/apps/api/internal/transport/iam"
	tprojects "github.com/sb0rka/sb0rka/apps/api/internal/transport/projects"
	tresources "github.com/sb0rka/sb0rka/apps/api/internal/transport/resources"
	"github.com/sb0rka/sb0rka/apps/api/internal/transport/runtime"
	tsecrets "github.com/sb0rka/sb0rka/apps/api/internal/transport/secrets"
	ttags "github.com/sb0rka/sb0rka/apps/api/internal/transport/tags"
)

type Dependencies = runtime.Dependencies

type Server struct {
	deps      runtime.Dependencies
	iam       *tiam.Handler
	projects  *tprojects.Handler
	databases *tdatabases.Handler
	resources *tresources.Handler
	secrets   *tsecrets.Handler
	tags      *ttags.Handler
}

func NewServer(deps runtime.Dependencies) *Server {
	return &Server{
		deps:      deps,
		iam:       tiam.NewHandler(deps),
		projects:  tprojects.NewHandler(deps),
		databases: tdatabases.NewHandler(deps),
		resources: tresources.NewHandler(deps),
		secrets:   tsecrets.NewHandler(deps),
		tags:      ttags.NewHandler(deps),
	}
}

func (s *Server) BuildCommonHandler() *http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /ping", s.ping)
	mux.HandleFunc("GET /health", s.health)
	mux.HandleFunc("GET /plans", s.iam.ListPublicPlans)

	mux.Handle("GET /plan", s.authMiddleware(http.HandlerFunc(s.iam.GetUserPlan)))

	// Projects
	mux.Handle("POST /projects", s.authMiddleware(http.HandlerFunc(s.projects.CreateProject)))
	mux.Handle("GET /projects", s.authMiddleware(http.HandlerFunc(s.projects.ListProjects)))
	mux.Handle("GET /projects/{project_id}", s.authMiddleware(http.HandlerFunc(s.projects.GetProject)))
	mux.Handle("PATCH /projects/{project_id}", s.authMiddleware(http.HandlerFunc(s.projects.UpdateProject)))
	mux.Handle("DELETE /projects/{project_id}", s.authMiddleware(http.HandlerFunc(s.projects.DeactivateProject)))

	// Resources
	mux.Handle("GET /projects/{project_id}/resources", s.authMiddleware(http.HandlerFunc(s.resources.ListResources)))
	mux.Handle("GET /projects/{project_id}/resources/{resource_id}", s.authMiddleware(http.HandlerFunc(s.resources.GetResource)))

	// Databases
	mux.Handle("POST /projects/{project_id}/database", s.authMiddleware(http.HandlerFunc(s.databases.CreateDatabase)))
	mux.Handle("GET /projects/{project_id}/databases", s.authMiddleware(http.HandlerFunc(s.databases.ListDatabases)))
	mux.Handle("GET /projects/{project_id}/resources/{resource_id}/database", s.authMiddleware(http.HandlerFunc(s.databases.GetDatabase)))
	mux.Handle("PATCH /projects/{project_id}/resources/{resource_id}/database", s.authMiddleware(http.HandlerFunc(s.databases.UpdateDatabase)))
	mux.Handle("GET /projects/{project_id}/resources/{resource_id}/database/uri", s.authMiddleware(http.HandlerFunc(s.databases.GetDatabaseURI)))
	mux.Handle("DELETE /projects/{project_id}/resources/{resource_id}/database", s.authMiddleware(http.HandlerFunc(s.databases.DeleteDatabase)))

	// Database Tables
	mux.Handle("POST /projects/{project_id}/resources/{resource_id}/table", s.authMiddleware(http.HandlerFunc(s.databases.CreateDatabaseTable)))
	mux.Handle("GET /projects/{project_id}/resources/{resource_id}/tables", s.authMiddleware(http.HandlerFunc(s.databases.ListDatabaseTables)))
	mux.Handle("GET /projects/{project_id}/resources/{resource_id}/tables/{table_id}", s.authMiddleware(http.HandlerFunc(s.databases.GetDatabaseTable)))
	mux.Handle("PATCH /projects/{project_id}/resources/{resource_id}/tables/{table_id}", s.authMiddleware(http.HandlerFunc(s.databases.UpdateDatabaseTable)))
	mux.Handle("DELETE /projects/{project_id}/resources/{resource_id}/tables/{table_id}", s.authMiddleware(http.HandlerFunc(s.databases.DeleteDatabaseTable)))

	// Database Columns
	mux.Handle("POST /projects/{project_id}/resources/{resource_id}/tables/{table_id}/column", s.authMiddleware(http.HandlerFunc(s.databases.CreateDatabaseColumn)))
	mux.Handle("GET /projects/{project_id}/resources/{resource_id}/tables/{table_id}/columns", s.authMiddleware(http.HandlerFunc(s.databases.ListDatabaseColumns)))
	mux.Handle("GET /projects/{project_id}/resources/{resource_id}/tables/{table_id}/columns/{column_id}", s.authMiddleware(http.HandlerFunc(s.databases.GetDatabaseColumn)))
	mux.Handle("PATCH /projects/{project_id}/resources/{resource_id}/tables/{table_id}/columns/{column_id}", s.authMiddleware(http.HandlerFunc(s.databases.UpdateDatabaseColumn)))
	mux.Handle("DELETE /projects/{project_id}/resources/{resource_id}/tables/{table_id}/columns/{column_id}", s.authMiddleware(http.HandlerFunc(s.databases.DeleteDatabaseColumn)))

	// Secrets
	mux.Handle("POST /projects/{project_id}/secret", s.authMiddleware(http.HandlerFunc(s.secrets.CreateSecret)))
	mux.Handle("GET /projects/{project_id}/secrets", s.authMiddleware(http.HandlerFunc(s.secrets.ListSecrets)))
	mux.Handle("GET /projects/{project_id}/resources/{resource_id}/reveal", s.authMiddleware(http.HandlerFunc(s.secrets.RevealSecret)))
	mux.Handle("PATCH /projects/{project_id}/resources/{resource_id}/secret", s.authMiddleware(http.HandlerFunc(s.secrets.UpdateSecretValue)))

	// Tags
	mux.Handle("GET /projects/{project_id}/tags", s.authMiddleware(http.HandlerFunc(s.tags.ListProjectTags)))
	mux.Handle("GET /projects/{project_id}/resources/{resource_id}/tags", s.authMiddleware(http.HandlerFunc(s.tags.ListResourceTags)))
	mux.Handle("POST /projects/{project_id}/resources/{resource_id}/tag", s.authMiddleware(http.HandlerFunc(s.tags.AttachResourceTag)))
	mux.Handle("DELETE /projects/{project_id}/resources/{resource_id}/tags/{tag_id}", s.authMiddleware(http.HandlerFunc(s.tags.DeleteResourceTag)))

	commonHandler := s.loggerMiddleware(mux)
	commonHandler = s.corsMiddleware(commonHandler)
	commonHandler = s.panicMiddleware(commonHandler)

	return &commonHandler
}
