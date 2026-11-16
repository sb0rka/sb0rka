package cli

import (
	"github.com/sb0rka/sb0rka/apps/api/pkg/apiapp"
	"github.com/spf13/cobra"
)

func NewCmdServer(opts apiapp.Options) *cobra.Command {
	return &cobra.Command{
		Use:   "server",
		Short: "Run API server",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			serverOpts := opts
			// Downstream builds can override the root version after creating the commands.
			serverOpts.Info.Version = cmd.Root().Version
			return apiapp.New(serverOpts).Run(cmd.Context())
		},
	}
}
