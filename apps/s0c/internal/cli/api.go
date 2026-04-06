package cli

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/sb0rka/sb0rka/apps/s0c/internal/app"
	"github.com/sb0rka/sb0rka/apps/s0c/internal/config"

	"github.com/spf13/cobra"
)

func resolveProjectID(flagValue string, cfg config.Config) (string, error) {
	s := strings.TrimSpace(flagValue)
	if s != "" {
		return s, nil
	}

	s = strings.TrimSpace(cfg.ProjectID)
	if s != "" {
		return s, nil
	}
	return "", fmt.Errorf("project ID is required: use --project-id or `s0c config -p`")
}

func resolveDatabaseID(flagValue string, cfg config.Config) (string, error) {
	s := strings.TrimSpace(flagValue)
	if s != "" {
		return s, nil
	}

	s = strings.TrimSpace(cfg.DatabaseID)
	if s != "" {
		return s, nil
	}
	return "", fmt.Errorf("database ID is required: use --database-id or `s0c config -d`")
}

func projectIDFromFlagsOrConfig(cmd *cobra.Command, cfg config.Config) (string, error) {
	s, err := cmd.Flags().GetString("project-id")
	if err != nil {
		return "", err
	}
	return resolveProjectID(s, cfg)
}

func databaseIDFromFlagsOrConfig(cmd *cobra.Command, cfg config.Config) (string, error) {
	s, err := cmd.Flags().GetString("database-id")
	if err != nil {
		return "", err
	}
	return resolveDatabaseID(s, cfg)
}

func printJSON(cmd *cobra.Command, payload any) error {
	pretty := false
	if cmd.Flags().Lookup("pretty") != nil {
		if v, err := cmd.Flags().GetBool("pretty"); err == nil {
			pretty = v
		}
	}

	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}

	if !pretty {
		_, err := fmt.Fprintln(cmd.OutOrStdout(), string(raw))
		return err
	}

	var buf bytes.Buffer
	if err := json.Indent(&buf, raw, "", "  "); err != nil {
		_, writeErr := fmt.Fprintln(cmd.OutOrStdout(), string(raw))
		return writeErr
	}

	_, err = fmt.Fprintln(cmd.OutOrStdout(), buf.String())
	return err
}

func NewCmdAPIPlans() *cobra.Command {
	platformService := app.NewPlatformService(S0CVersion)

	cmd := &cobra.Command{
		Use:   "plan",
		Short: "Get current user plan",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			payload, err := platformService.GetUserPlan(cmd.Context())
			if err != nil {
				return err
			}
			return printJSON(cmd, payload)
		},
	}

	cmd.Flags().Bool("pretty", false, "Pretty-print JSON response")

	return cmd
}

func NewCmdAPIProjects() *cobra.Command {
	platformService := app.NewPlatformService(S0CVersion)

	cmd := &cobra.Command{
		Use:   "projects",
		Short: "List projects",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			payload, err := platformService.ListProjects(cmd.Context())
			if err != nil {
				return err
			}
			return printJSON(cmd, payload)
		},
	}
	cmd.Flags().Bool("pretty", false, "Pretty-print JSON response")

	return cmd
}

func NewCmdAPIDatabases() *cobra.Command {
	platformService := app.NewPlatformService(S0CVersion)

	cmd := &cobra.Command{
		Use:     "dbs",
		Aliases: []string{"databases"},
		Short:   "Database API operations",
		Args:    cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := config.Load()
			if err != nil {
				return err
			}

			projectID, err := projectIDFromFlagsOrConfig(cmd, cfg)
			if err != nil {
				return err
			}

			payload, err := platformService.ListDatabases(cmd.Context(), projectID)
			if err != nil {
				return err
			}
			return printJSON(cmd, payload)
		},
	}
	cmd.PersistentFlags().StringP("project-id", "p", "", "Project ID (overrides default from `s0c config`)")
	cmd.Flags().Bool("pretty", false, "Pretty-print JSON response")

	uriCmd := &cobra.Command{
		Use:   "uri",
		Short: "Get database connection URI",
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

			uri, err := platformService.GetDatabaseURI(cmd.Context(), projectID, dbID)
			if err != nil {
				return err
			}

			_, err = fmt.Fprintln(cmd.OutOrStdout(), uri)
			return err
		},
	}
	uriCmd.Flags().StringP("database-id", "d", "", "Database resource ID (overrides default from `s0c config`)")
	cmd.AddCommand(uriCmd)

	createCmd := &cobra.Command{
		Use:   "create",
		Short: "Create a database",
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

			name, err := cmd.Flags().GetString("name")
			if err != nil {
				return err
			}
			description, err := cmd.Flags().GetString("description")
			if err != nil {
				return err
			}

			payload, err := platformService.CreateDatabase(cmd.Context(), projectID, name, description)
			if err != nil {
				return err
			}
			return printJSON(cmd, payload)
		},
	}
	createCmd.Flags().String("name", "", "Database name")
	createCmd.Flags().String("description", "", "Database description")
	createCmd.Flags().Bool("pretty", false, "Pretty-print JSON response")
	_ = createCmd.MarkFlagRequired("name")
	cmd.AddCommand(createCmd)

	return cmd
}

func NewCmdAPI() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "api",
		Short: "Direct API commands",
		Args:  cobra.NoArgs,
	}

	cmd.AddCommand(
		NewCmdAPIPlans(),
		NewCmdAPIProjects(),
		NewCmdAPIDatabases(),
	)

	return cmd
}
