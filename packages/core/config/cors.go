package config

import (
	"fmt"
	"net/url"
	"strings"
)

func ParseCORSWhitelist(raw string) map[string]bool {
	corsWhitelistSls := strings.Split(strings.ReplaceAll(raw, " ", ""), ",")
	corsWhitelist := make(map[string]bool, len(corsWhitelistSls))
	for _, uri := range corsWhitelistSls {
		if uri == "" {
			continue
		}
		if uri == "*" {
			return map[string]bool{"*": true}
		}
		valid, err := url.ParseRequestURI(uri)
		if err != nil {
			fmt.Printf("Ignoring incorrect URI %s", uri)
			continue
		}
		corsWhitelist[valid.String()] = true
	}
	return corsWhitelist
}
