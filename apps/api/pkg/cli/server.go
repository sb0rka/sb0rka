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
			return apiapp.New(opts).Run(cmd.Context())
		},
	}
}
