package cli

import (
	"fmt"

	"github.com/sb0rka/sb0rka/apps/api/internal/service"
	"github.com/spf13/cobra"
)

func NewCmdGenSecretKey() *cobra.Command {
	return &cobra.Command{
		Use:   "gen-secret-key",
		Short: "Generate secret key",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			keysetJSON, err := service.GenerateTinkAEADKeysetJSON()
			if err != nil {
				return fmt.Errorf("failed to generate tink keyset: %w", err)
			}
			_, err = fmt.Fprintf(cmd.OutOrStdout(), "SECRET_TINK_KEYSET_JSON=%s\n", keysetJSON)
			return err
		},
	}
}
