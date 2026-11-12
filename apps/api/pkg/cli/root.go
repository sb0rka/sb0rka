// Package cli provides the community API CLI for standalone and extended builds.
package cli

import (
	"github.com/sb0rka/sb0rka/apps/api/pkg/apiapp"
	"github.com/spf13/cobra"
)

// NewCmdRoot returns a fresh command tree using opts for the server command.
// Downstream builds can add commands and override Version before execution.
func NewCmdRoot(opts apiapp.Options) *cobra.Command {
	cmd := &cobra.Command{
		Use:           "api",
		Short:         "Sb0rka platform API",
		Version:       APIVersion,
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	cmd.AddCommand(NewCmdServer(opts), NewCmdGenSecretKey(), NewCmdVersion())
	return cmd
}
