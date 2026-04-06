package cli

import (
	"context"
	"fmt"

	"github.com/spf13/cobra"
)

type ExitCodeError struct {
	Code int
}

func (e *ExitCodeError) Error() string {
	return fmt.Sprintf("process exited with code %d", e.Code)
}

func NewCmdRoot() *cobra.Command {
	cmd := &cobra.Command{
		Use:           "s0c",
		Short:         "s0c CLI",
		Long:          "s0c is a minimal CLI for SB0RKA API operations.",
		SilenceUsage:  true,
		SilenceErrors: true,
	}

	cmd.AddCommand(
		NewCmdAuth(),
		NewCmdConfig(),
		NewCmdAPI(),
		NewCmdPsql(),
		NewCmdVersion(),
	)

	return cmd
}

func RunCmd(ctx context.Context) error {
	return NewCmdRoot().ExecuteContext(ctx)
}
