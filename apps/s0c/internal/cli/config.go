package cli

import (
	"fmt"

	"github.com/sb0rka/sb0rka/apps/s0c/internal/config"

	"github.com/spf13/cobra"
)

func NewCmdConfig() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "config",
		Short: "Save defaults in local config",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			if !cmd.Flags().Changed("project-id") && !cmd.Flags().Changed("database-id") {
				return fmt.Errorf("provide at least one of --project-id or --database-id")
			}

			cfg, err := config.Load()
			if err != nil {
				return err
			}

			if cmd.Flags().Changed("project-id") {
				cfg.ProjectID, err = cmd.Flags().GetString("project-id")
				if err != nil {
					return err
				}
			}
			if cmd.Flags().Changed("database-id") {
				cfg.DatabaseID, err = cmd.Flags().GetString("database-id")
				if err != nil {
					return err
				}
			}

			if err := config.Save(cfg); err != nil {
				return fmt.Errorf("save config: %w", err)
			}

			path, err := config.Path()
			if err != nil {
				return err
			}
			_, err = fmt.Fprintf(cmd.OutOrStdout(), "Defaults saved to %s\n", path)
			return err
		},
	}

	cmd.Flags().StringP("project-id", "p", "", "Default project ID")
	cmd.Flags().StringP("database-id", "d", "", "Default database resource ID")

	return cmd
}
