package cli

import (
	"fmt"

	"github.com/spf13/cobra"
)

const S0CVersion = "v0.0.1"

func NewCmdVersion() *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "Print s0c version",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			_, err := fmt.Fprintln(cmd.OutOrStdout(), S0CVersion)
			return err
		},
	}
}
