package cli

import (
	"errors"
	"fmt"
	"os"
	"os/exec"

	"github.com/sb0rka/sb0rka/apps/s0c/internal/app"
	"github.com/sb0rka/sb0rka/apps/s0c/internal/config"
	"github.com/sb0rka/sb0rka/apps/s0c/internal/pgwrap"

	"github.com/spf13/cobra"
)

func NewCmdPsql() *cobra.Command {
	platformService := app.NewPlatformService(S0CVersion)

	cmd := &cobra.Command{
		Use:   "psql",
		Short: "Open an interactive psql session",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := config.Load()
			if err != nil {
				return err
			}

			projectID, err := projectIDFromFlagsOrConfig(cmd, cfg)
			if err != nil {
				return err
			}
			dbID, err := databaseIDFromFlagsOrConfig(cmd, cfg)
			if err != nil {
				return err
			}

			rawURI, err := platformService.GetDatabaseURI(cmd.Context(), projectID, dbID)
			if err != nil {
				return err
			}

			sanitizedURI, passfileEntry, err := pgwrap.BuildTarget(rawURI)
			if err != nil {
				return err
			}

			psqlPath, err := exec.LookPath("psql")
			if err != nil {
				return fmt.Errorf("psql not found in PATH; install PostgreSQL client tools and try again")
			}

			cleanup := func() {}
			childEnv := withoutPGPassword(os.Environ())

			if passfileEntry != nil {
				configDir, err := config.ConfigDir()
				if err != nil {
					return err
				}

				passfilePath, cleanupPassfile, err := pgwrap.WritePassfile(configDir, *passfileEntry)
				if err != nil {
					return err
				}
				cleanup = cleanupPassfile
				childEnv = withEnvVar(childEnv, "PGPASSFILE", passfilePath)
			}
			defer cleanup()

			child := exec.Command(psqlPath, sanitizedURI)
			child.Stdin = os.Stdin
			child.Stdout = os.Stdout
			child.Stderr = os.Stderr
			child.Env = childEnv

			if err := child.Run(); err != nil {
				var exitErr *exec.ExitError
				if errors.As(err, &exitErr) {
					code := exitErr.ExitCode()
					if code < 0 {
						code = 1
					}
					return &ExitCodeError{Code: code}
				}
				return fmt.Errorf("run psql: %w", err)
			}
			return nil
		},
	}

	cmd.Flags().StringP("project-id", "p", "", "Project ID (overrides default from `s0c config`)")
	cmd.Flags().StringP("database-id", "d", "", "Database resource ID (overrides default from `s0c config`)")

	return cmd
}

func withoutPGPassword(env []string) []string {
	out := make([]string, 0, len(env))
	for _, kv := range env {
		if len(kv) >= len("PGPASSWORD=") && kv[:len("PGPASSWORD=")] == "PGPASSWORD=" {
			continue
		}
		out = append(out, kv)
	}
	return out
}

func withEnvVar(env []string, key string, value string) []string {
	prefix := key + "="
	out := make([]string, 0, len(env)+1)
	replaced := false
	for _, kv := range env {
		if len(kv) >= len(prefix) && kv[:len(prefix)] == prefix {
			out = append(out, prefix+value)
			replaced = true
			continue
		}
		out = append(out, kv)
	}
	if !replaced {
		out = append(out, prefix+value)
	}
	return out
}
