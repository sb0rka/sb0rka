// Package cli provides the community drones CLI for standalone and extended builds.
package cli

import "github.com/spf13/cobra"

// NewCmdRoot returns a fresh command tree. Downstream builds can add commands
// before execution without introducing private dependencies into this module.
func NewCmdRoot() *cobra.Command {
	cmd := &cobra.Command{
		Use:           "drones",
		Short:         "Background tasks for Sb0rka",
		Version:       DronesVersion,
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	cmd.AddCommand(NewCmdGC(), NewCmdVersion())
	return cmd
}
