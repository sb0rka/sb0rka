package auth

import (
	"fmt"
	"time"

	coreconfig "github.com/sb0rka/sb0rka/packages/core/config"
)

// AccessTokenPolicy separates the signed lifetime limit from clock tolerance.
type AccessTokenPolicy struct {
	MaxTTL    time.Duration
	ClockSkew time.Duration
}

func DefaultAccessTokenPolicy() AccessTokenPolicy {
	return AccessTokenPolicy{MaxTTL: DefaultMaxAccessTokenTTL, ClockSkew: DefaultAccessTokenSkew}
}

func (p AccessTokenPolicy) Validate() error {
	if p.MaxTTL <= 0 || p.ClockSkew < 0 {
		return fmt.Errorf("access token max TTL must be positive and clock skew must be nonnegative")
	}
	return nil
}

// AccessTokenPolicyFromEnv is called at startup, never during token verification.
func AccessTokenPolicyFromEnv() (*AccessTokenPolicy, error) {
	maximum, err := coreconfig.GetDurationEnvStrict("MAX_ACCESS_TOKEN_TTL_SEC", DefaultMaxAccessTokenTTL, time.Second)
	if err != nil {
		return nil, err
	}
	skew, err := coreconfig.GetDurationEnvStrict("ACCESS_TOKEN_CLOCK_SKEW_SEC", DefaultAccessTokenSkew, time.Second)
	if err != nil {
		return nil, err
	}
	policy := &AccessTokenPolicy{MaxTTL: maximum, ClockSkew: skew}
	if err := policy.Validate(); err != nil {
		return nil, err
	}
	return policy, nil
}
