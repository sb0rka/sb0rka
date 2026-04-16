package cli

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"github.com/sb0rka/sb0rka/apps/s0c/internal/app"

	"github.com/spf13/cobra"
	"golang.org/x/term"
)

func NewCmdAuth() *cobra.Command {
	authService := app.NewAuthService(S0CVersion)

	cmd := &cobra.Command{
		Use:   "auth",
		Short: "Authentication commands",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			return cmd.Help()
		},
	}

	loginCmd := &cobra.Command{
		Use:   "login",
		Short: "Log in and store local auth state",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			_, err := fmt.Fprint(cmd.ErrOrStderr(), "Username or email: ")
			if err != nil {
				return err
			}

			reader := bufio.NewReader(cmd.InOrStdin())
			usernameOrEmailRaw, err := reader.ReadString('\n')
			if err != nil {
				return fmt.Errorf("read username or email: %w", err)
			}
			usernameOrEmail := strings.TrimSpace(usernameOrEmailRaw)
			if usernameOrEmail == "" {
				return fmt.Errorf("username or email cannot be empty")
			}

			_, err = fmt.Fprint(cmd.ErrOrStderr(), "Password: ")
			if err != nil {
				return err
			}

			passwordBytes, err := term.ReadPassword(int(os.Stdin.Fd()))
			if err != nil {
				return fmt.Errorf("read password: %w", err)
			}
			_, _ = fmt.Fprintln(cmd.ErrOrStderr())

			password := strings.TrimSpace(string(passwordBytes))
			if password == "" {
				return fmt.Errorf("password cannot be empty")
			}

			if err := authService.Login(cmd.Context(), usernameOrEmail, password); err != nil {
				return err
			}

			_, err = fmt.Fprintln(cmd.OutOrStdout(), "Auth locked in. You're ready to run s0c.")
			return err
		},
	}

	logoutCmd := &cobra.Command{
		Use:   "logout",
		Short: "Log out and clear local auth/config state",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			if err := authService.Logout(cmd.Context()); err != nil {
				return err
			}

			_, err := fmt.Fprintln(cmd.OutOrStdout(), "Logged out. Local auth and defaults were cleared.")
			return err
		},
	}

	cmd.AddCommand(loginCmd)
	cmd.AddCommand(logoutCmd)

	return cmd
}
