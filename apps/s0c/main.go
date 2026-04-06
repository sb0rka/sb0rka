package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/sb0rka/sb0rka/apps/s0c/internal/cli"
)

type ExitCodeError struct {
	Code int
}

func (e *ExitCodeError) Error() string {
	return fmt.Sprintf("process exited with code %d", e.Code)
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := cli.RunCmd(ctx); err != nil {
		var exitCodeErr *cli.ExitCodeError
		if errors.As(err, &exitCodeErr) {
			os.Exit(exitCodeErr.Code)
		}
		_, _ = fmt.Fprintln(os.Stderr, "s0c:", err)
		os.Exit(1)
	}
}
