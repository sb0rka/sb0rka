package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/sb0rka/sb0rka/apps/drones/pkg/cli"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := cli.NewCmdRoot().ExecuteContext(ctx); err != nil {
		if errors.Is(err, context.Canceled) && ctx.Err() != nil {
			return
		}
		_, _ = fmt.Fprintln(os.Stderr, "drones:", err)
		os.Exit(1)
	}
}
