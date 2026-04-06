package cli

import (
	"fmt"
	"os"
	"strings"

	"github.com/sb0rka/sb0rka/apps/s0c/internal/app"

	"github.com/spf13/cobra"
	"golang.org/x/term"
)

func NewCmdAuth() *cobra.Command {
	authService := app.NewAuthService(S0CVersion)

	return &cobra.Command{
		Use:   "auth",
		Short: "Set auth credentials locally",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			_, err := fmt.Fprint(cmd.ErrOrStderr(), "Paste your sb0rka refresh token: ")
			if err != nil {
				return err
			}

			tokenBytes, err := term.ReadPassword(int(os.Stdin.Fd()))
			if err != nil {
				return fmt.Errorf("read refresh token: %w", err)
			}
			_, _ = fmt.Fprintln(cmd.ErrOrStderr())

			token := strings.TrimSpace(string(tokenBytes))
			if token == "" {
				return fmt.Errorf("refresh token cannot be empty")
			}

			if err := authService.SaveAndVerifyToken(cmd.Context(), token); err != nil {
				return err
			}

			_, err = fmt.Fprintln(cmd.OutOrStdout(), "Auth locked in. You're ready to run s0c.")
			return err
		},
	}
}
