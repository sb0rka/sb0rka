package main

import (
	"context"
	_ "embed"
	"flag"
	"fmt"
	"os"
	"strings"

	"github.com/sb0rka/sb0rka/apps/api/internal/service"
	"github.com/sb0rka/sb0rka/apps/api/pkg/apiapp"
)

//go:embed version.txt
var versionFile string

var APIVersion = strings.TrimSpace(versionFile)

func serverCMD(args []string) error {
	fs := flag.NewFlagSet("server", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)

	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() != 0 {
		return fmt.Errorf("server cmd got unexpected arguments: %v", fs.Args())
	}

	return apiapp.New(apiapp.Options{}).Run(context.Background())
}

func secretKeyCMD(args []string) error {
	fs := flag.NewFlagSet("secret-key", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)

	keysetJSON, err := service.GenerateTinkAEADKeysetJSON()
	if err != nil {
		return fmt.Errorf("failed to generate tink keyset: %w", err)
	}
	fmt.Printf("SECRET_TINK_KEYSET_JSON=%s\n", keysetJSON)

	return nil
}

func versionCMD(args []string) error {
	fs := flag.NewFlagSet("version", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)

	if err := fs.Parse(args); err != nil {
		return err
	}

	_, err := fmt.Fprintln(os.Stdout, APIVersion)
	return err
}

func usageCMD(w *os.File) {
	fmt.Fprintln(w, "Usage: api <command> [flags]")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Commands:")
	fmt.Fprintln(w, "  gen-secret-key     Generate secret key")
	fmt.Fprintln(w, "  server    Run API server")
	fmt.Fprintln(w, "  version   Print api version")
}

func run(args []string) error {
	if len(args) == 0 {
		usageCMD(os.Stderr)
		return flag.ErrHelp
	}

	switch args[0] {
	case "gen-secret-key":
		return secretKeyCMD(args[1:])
	case "server":
		return serverCMD(args[1:])
	case "version":
		return versionCMD(args[1:])
	case "-h", "--help", "help":
		usageCMD(os.Stdout)
		return nil
	default:
		usageCMD(os.Stderr)
		return fmt.Errorf("unknown command %q", args[0])
	}
}

// @title           Sb0rka Platform API
// @version          0.1.0
// @description      REST API платформы Sb0rka: проекты, базы данных, секреты, теги.
// @BasePath         /
// @securityDefinitions.apikey  BearerAuth
// @in               header
// @name             Authorization
func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}
