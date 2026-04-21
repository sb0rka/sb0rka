package telemetry

import (
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strconv"
	"time"
)

func aggregateMatrixSeries(series []prometheusMatrixSeries) ([]Point, error) {
	if len(series) == 0 {
		return []Point{}, nil
	}

	aggregated := make(map[int64]float64)
	for _, entry := range series {
		for _, sample := range entry.Values {
			if len(sample) != 2 {
				return nil, fmt.Errorf("invalid sample length: %d", len(sample))
			}

			tsSec, err := parseTimestamp(sample[0])
			if err != nil {
				return nil, fmt.Errorf("parse sample timestamp: %w", err)
			}

			value, err := parseSampleValue(sample[1])
			if err != nil {
				return nil, fmt.Errorf("parse sample value: %w", err)
			}
			if math.IsNaN(value) || math.IsInf(value, 0) {
				continue
			}
			aggregated[tsSec] += value
		}
	}

	keys := make([]int64, 0, len(aggregated))
	for ts := range aggregated {
		keys = append(keys, ts)
	}
	sort.Slice(keys, func(i, j int) bool {
		return keys[i] < keys[j]
	})

	points := make([]Point, 0, len(keys))
	for _, ts := range keys {
		points = append(points, Point{
			TS:    time.Unix(ts, 0).UTC(),
			Value: aggregated[ts],
		})
	}

	return points, nil
}

func parseTimestamp(raw any) (int64, error) {
	switch v := raw.(type) {
	case float64:
		return int64(v), nil
	case json.Number:
		f, err := v.Float64()
		if err != nil {
			return 0, err
		}
		return int64(f), nil
	case string:
		f, err := strconv.ParseFloat(v, 64)
		if err != nil {
			return 0, err
		}
		return int64(f), nil
	default:
		return 0, fmt.Errorf("unexpected timestamp type %T", raw)
	}
}

func parseSampleValue(raw any) (float64, error) {
	switch v := raw.(type) {
	case float64:
		return v, nil
	case json.Number:
		return v.Float64()
	case string:
		return strconv.ParseFloat(v, 64)
	default:
		return 0, fmt.Errorf("unexpected value type %T", raw)
	}
}
