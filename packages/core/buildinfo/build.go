package buildinfo

import (
	"log/slog"
	"runtime"
	"runtime/debug"
)

// Revision is injected by the release build even when the Docker context lacks .git.
var Revision = "unknown"
var SourceSHA256 = "unknown"

func Log(log *slog.Logger) {
	revision, modified := Revision, "unknown"
	if info, ok := debug.ReadBuildInfo(); ok {
		for _, s := range info.Settings {
			if s.Key == "vcs.revision" && revision == "unknown" {
				revision = s.Value
			}
			if s.Key == "vcs.modified" {
				modified = s.Value
			}
		}
	}
	log.Info("build_identity", "revision", revision, "compiler", runtime.Version(), "vcs_modified", modified, "source_sha256", SourceSHA256)
}
