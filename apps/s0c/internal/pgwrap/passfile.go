package pgwrap

import (
	"fmt"
	"os"
	"path/filepath"
)

func WritePassfile(dir string, entry PassfileEntry) (string, func(), error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", nil, fmt.Errorf("create passfile directory: %w", err)
	}

	f, err := os.CreateTemp(dir, "pgpass-*")
	if err != nil {
		return "", nil, fmt.Errorf("create temporary passfile: %w", err)
	}

	path := f.Name()
	cleanup := func() {
		_ = os.Remove(path)
	}

	if err := f.Chmod(0o600); err != nil {
		_ = f.Close()
		cleanup()
		return "", nil, fmt.Errorf("chmod passfile: %w", err)
	}

	if _, err := f.WriteString(entry.Line() + "\n"); err != nil {
		_ = f.Close()
		cleanup()
		return "", nil, fmt.Errorf("write passfile: %w", err)
	}
	if err := f.Sync(); err != nil {
		_ = f.Close()
		cleanup()
		return "", nil, fmt.Errorf("sync passfile: %w", err)
	}
	if err := f.Close(); err != nil {
		cleanup()
		return "", nil, fmt.Errorf("close passfile: %w", err)
	}

	return filepath.Clean(path), cleanup, nil
}
