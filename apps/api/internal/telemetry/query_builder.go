package telemetry

import (
	"fmt"
	"regexp"
	"strings"
)

type promMatcher struct {
	key   string
	op    string
	value string
}

func buildPromQL(metric Metric, target telemetryTarget, clusterLabel string) (string, error) {
	switch metric {
	case MetricActiveConnections:
		databaseMatcher := promMatcher{
			key:   "database",
			op:    "=~",
			value: fmt.Sprintf("^(%s|pgbouncer)$", regexp.QuoteMeta(target.pgBouncerDatabaseName)),
		}
		return fmt.Sprintf(
			`sum(pgbouncer_pools_client_active_connections{%s})`,
			renderMatchers(
				withCluster(clusterLabel),
				promMatcher{key: "namespace", op: "=", value: target.tenantNamespace},
				databaseMatcher,
			),
		), nil
	case MetricDBSize:
		return fmt.Sprintf(
			`sum(cnpg_pg_database_size_bytes{%s})`,
			renderMatchers(
				withCluster(clusterLabel),
				promMatcher{key: "namespace", op: "=", value: target.tenantNamespace},
				promMatcher{key: "job", op: "=", value: "kubernetes-pods"},
				promMatcher{key: "datname", op: "!~", value: "^(postgres|template0|template1)$"},
			),
		), nil
	case MetricDBSizeRate:
		left := renderMatchers(
			withCluster(clusterLabel),
			promMatcher{key: "namespace", op: "=", value: target.tenantNamespace},
			promMatcher{key: "job", op: "=", value: "kubernetes-pods"},
			promMatcher{key: "datname", op: "!~", value: "^(postgres|template0|template1)$"},
		)
		right := renderMatchers(
			withCluster(clusterLabel),
			promMatcher{key: "namespace", op: "=", value: target.tenantNamespace},
		)
		return fmt.Sprintf(
			`100 * sum(cnpg_pg_database_size_bytes{%s}) / clamp_min(sum(kube_persistentvolumeclaim_resource_requests_storage_bytes{%s}), 1)`,
			left,
			right,
		), nil
	case MetricNetReceive:
		return fmt.Sprintf(
			`sum(rate(container_network_receive_bytes_total{%s}[5m]))`,
			renderMatchers(
				withCluster(clusterLabel),
				promMatcher{key: "namespace", op: "=", value: target.tenantNamespace},
				promMatcher{key: "pod", op: "=~", value: target.postgresPodIncludeRe},
				promMatcher{key: "pod", op: "!~", value: target.postgresPodExcludeRe},
			),
		), nil
	case MetricNetTransmit:
		return fmt.Sprintf(
			`sum(rate(container_network_transmit_bytes_total{%s}[5m]))`,
			renderMatchers(
				withCluster(clusterLabel),
				promMatcher{key: "namespace", op: "=", value: target.tenantNamespace},
				promMatcher{key: "pod", op: "=~", value: target.postgresPodIncludeRe},
				promMatcher{key: "pod", op: "!~", value: target.postgresPodExcludeRe},
			),
		), nil
	default:
		return "", ErrUnknownMetric
	}
}

func withCluster(cluster string) promMatcher {
	if strings.TrimSpace(cluster) == "" {
		return promMatcher{}
	}
	return promMatcher{key: "cluster", op: "=", value: strings.TrimSpace(cluster)}
}

func renderMatchers(matchers ...promMatcher) string {
	parts := make([]string, 0, len(matchers))
	for _, matcher := range matchers {
		if matcher.key == "" || matcher.op == "" {
			continue
		}
		parts = append(
			parts,
			fmt.Sprintf(`%s%s"%s"`, matcher.key, matcher.op, escapePromValue(matcher.value)),
		)
	}
	return strings.Join(parts, ", ")
}

func escapePromValue(raw string) string {
	out := strings.ReplaceAll(raw, `\`, `\\`)
	return strings.ReplaceAll(out, `"`, `\"`)
}
