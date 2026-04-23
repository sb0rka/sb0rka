import type { CSSProperties } from "react"
import { useEffect, useMemo, useState } from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { ObservabilityMetricPoint } from "../api"

interface DetailTimeseriesChartProps {
  title: string
  xAxisLabel?: string
  yAxisLabel?: string
  points: ObservabilityMetricPoint[]
  formatValue: (value: number) => string
}

interface ChartPoint {
  timestampMs: number
  timestampIso: string
  value: number
}

const DEFAULT_WINDOW_MS = 2 * 60 * 60 * 1000
const MIN_WINDOW_PERCENT = 0.01

const axisDateTimeFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
})

const axisTimeFormatter = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
})

const axisDateOnlyFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
})

function formatAxisDateOnlyLabel(timestampMs: number): string {
  return axisDateOnlyFormatter.format(new Date(timestampMs))
}

function getAxisDayKey(timestampMs: number): string {
  const date = new Date(timestampMs)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function formatAxisDateTimeLabel(timestampMs: number): string {
  return axisDateTimeFormatter.format(new Date(timestampMs))
}

function formatAxisTimeLabel(timestampMs: number): string {
  return axisTimeFormatter.format(new Date(timestampMs))
}

const AXIS_TICK_STEPS_MS: readonly number[] = [
  1_000,
  5_000,
  10_000,
  15_000,
  30_000,
  60_000,
  2 * 60_000,
  5 * 60_000,
  10 * 60_000,
  15 * 60_000,
  30 * 60_000,
  60 * 60_000,
  2 * 60 * 60_000,
  3 * 60 * 60_000,
  6 * 60 * 60_000,
  12 * 60 * 60_000,
  24 * 60 * 60_000,
  2 * 24 * 60 * 60_000,
  7 * 24 * 60 * 60_000,
]

function pickAxisStepMs(rangeMs: number, targetTickCount = 8): number {
  if (rangeMs <= 0) return AXIS_TICK_STEPS_MS[0]!
  const idealStep = rangeMs / Math.max(1, targetTickCount)
  for (const step of AXIS_TICK_STEPS_MS) {
    if (step >= idealStep) return step
  }
  return AXIS_TICK_STEPS_MS[AXIS_TICK_STEPS_MS.length - 1]!
}

function generateAxisTicks(minMs: number, maxMs: number, stepMs: number): number[] {
  if (!Number.isFinite(minMs) || !Number.isFinite(maxMs) || stepMs <= 0) return []
  const anchor = new Date(minMs)
  anchor.setHours(0, 0, 0, 0)
  const anchorMs = anchor.getTime()
  const firstTick = anchorMs + Math.ceil((minMs - anchorMs) / stepMs) * stepMs
  const ticks: number[] = []
  for (let t = firstTick; t <= maxMs; t += stepMs) {
    ticks.push(t)
  }
  return ticks
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function formatWindowDuration(durationMs: number): string {
  const minutes = Math.max(1, Math.round(durationMs / 60_000))
  if (minutes < 60) return `${minutes}м`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (hours < 24) {
    if (remainingMinutes === 0) return `${hours}ч`
    return `${hours}ч ${remainingMinutes}м`
  }
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  if (remainingHours === 0) return `${days}д`
  return `${days}д ${remainingHours}ч`
}

export function DetailTimeseriesChart({
  title,
  xAxisLabel = "",
  yAxisLabel = "Значение",
  points,
  formatValue,
}: DetailTimeseriesChartProps) {
  const [windowPercent, setWindowPercent] = useState(100)

  const chartData = useMemo<ChartPoint[]>(
    () =>
      points
        .map((point) => ({
          timestampMs: new Date(point.timestamp).getTime(),
          timestampIso: point.timestamp,
          value: point.value,
        }))
        .filter((point) => Number.isFinite(point.timestampMs))
        .sort((left, right) => left.timestampMs - right.timestampMs),
    [points],
  )

  const hasData = chartData.length > 0
  const fullRangeMs = useMemo(() => {
    if (chartData.length < 2) return 0
    return chartData[chartData.length - 1]!.timestampMs - chartData[0]!.timestampMs
  }, [chartData])

  useEffect(() => {
    if (fullRangeMs <= 0) {
      setWindowPercent(100)
      return
    }
    const defaultWindowPercent = Math.min(
      100,
      Math.max(MIN_WINDOW_PERCENT, (DEFAULT_WINDOW_MS / fullRangeMs) * 100),
    )
    setWindowPercent(defaultWindowPercent)
  }, [fullRangeMs])

  const xWindowDomain = useMemo<[number, number]>(() => {
    if (chartData.length === 0) return [0, 1]
    const min = chartData[0]!.timestampMs
    const max = chartData[chartData.length - 1]!.timestampMs
    if (min === max) return [min - 60_000, max + 60_000]
    if (windowPercent >= 100) return [min, max]
    const windowMs = (fullRangeMs * windowPercent) / 100
    return [Math.max(min, max - windowMs), max]
  }, [chartData, fullRangeMs, windowPercent])

  const visibleChartData = useMemo(() => {
    if (chartData.length === 0) return chartData
    if (windowPercent >= 100) return chartData
    const [windowStart] = xWindowDomain
    return chartData.filter((point) => point.timestampMs >= windowStart)
  }, [chartData, windowPercent, xWindowDomain])

  const activeWindowMs = useMemo(() => {
    if (xWindowDomain[1] <= xWindowDomain[0]) return 0
    return xWindowDomain[1] - xWindowDomain[0]
  }, [xWindowDomain])
  const sliderStyle = useMemo(
    () => {
      const fillStartPercent = Math.max(0, 100 - windowPercent)
      return {
        background: `linear-gradient(to right, var(--border) 0%, var(--border) ${fillStartPercent}%, var(--primary) ${fillStartPercent}%, var(--primary) 100%)`,
        "--slider-thumb-size": "16px",
        "--slider-thumb-bg": "color-mix(in srgb, var(--primary) 12%, var(--card) 88%)",
        "--slider-thumb-border": "var(--primary)",
        "--slider-thumb-shadow": "0 0 0 1px color-mix(in srgb, var(--primary) 20%, transparent)",
      } as CSSProperties
    },
    [windowPercent],
  )
  const sliderPosition = useMemo(() => 100 - windowPercent, [windowPercent])

  const yDomain = useMemo<[number, number]>(() => {
    if (visibleChartData.length === 0) return [0, 1]
    const values = visibleChartData.map((point) => point.value)
    const min = Math.min(...values)
    const max = Math.max(...values)
    if (min === max) {
      const offset = Math.max(Math.abs(min) * 0.1, 1)
      return [min - offset, max + offset]
    }
    const padding = (max - min) * 0.08
    return [min - padding, max + padding]
  }, [visibleChartData])

  const axisTicks = useMemo(() => {
    const [minMs, maxMs] = xWindowDomain
    if (!Number.isFinite(minMs) || !Number.isFinite(maxMs) || maxMs <= minMs) {
      return [] as number[]
    }
    const step = pickAxisStepMs(maxMs - minMs)
    return generateAxisTicks(minMs, maxMs, step)
  }, [xWindowDomain])

  const firstOfDayTickSet = useMemo(() => {
    const result = new Set<number>()
    const seen = new Set<string>()
    for (const tick of axisTicks) {
      const dayKey = getAxisDayKey(tick)
      if (!seen.has(dayKey)) {
        seen.add(dayKey)
        result.add(tick)
      }
    }
    return result
  }, [axisTicks])

  const renderXAxisTick = useMemo(
    () => {
      return (props: {
        x?: number | string
        y?: number | string
        payload?: { value?: number | string }
      }) => {
        const { x = 0, y = 0, payload } = props
        const xNum = typeof x === "number" ? x : Number(x) || 0
        const yNum = typeof y === "number" ? y : Number(y) || 0
        const rawValue = payload?.value
        const timestampMs =
          typeof rawValue === "number"
            ? rawValue
            : typeof rawValue === "string"
              ? Number(rawValue)
              : NaN
        if (!Number.isFinite(timestampMs)) return <g />

        const isFirstOfDay = firstOfDayTickSet.has(timestampMs)

        if (isFirstOfDay) {
          return (
            <g transform={`translate(${xNum},${yNum})`}>
              <text
                textAnchor="middle"
                dy="0.71em"
                fontSize={12}
                fill="var(--muted-foreground)"
              >
                <tspan fill="var(--foreground)" fontWeight={600}>
                  {formatAxisDateOnlyLabel(timestampMs)}
                </tspan>
                {/* <tspan dx={4}>{formatAxisTimeLabel(timestampMs)}</tspan> */}
              </text>
            </g>
          )
        }

        return (
          <g transform={`translate(${xNum},${yNum})`}>
            <text
              textAnchor="middle"
              dy="0.71em"
              fontSize={12}
              fill="var(--muted-foreground)"
            >
              {formatAxisTimeLabel(timestampMs)}
            </text>
          </g>
        )
      }
    },
    [firstOfDayTickSet],
  )

  return (
    <div className="w-full rounded-xl border border-border/70 bg-card p-4 sm:p-6">
      <div className="mb-5">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      </div>

      {!hasData ? (
        <div className="flex h-[320px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/20">
          <p className="text-sm text-muted-foreground">Данные еще не поступили</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={visibleChartData} margin={{ top: 8, right: 8, left: 4, bottom: 26 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.35} />
            <XAxis
              type="number"
              dataKey="timestampMs"
              domain={xWindowDomain}
              scale="time"
              ticks={axisTicks.length > 0 ? axisTicks : undefined}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              tick={renderXAxisTick}
              minTickGap={18}
              label={{
                value: xAxisLabel,
                offset: 14,
                position: "insideBottom",
                fill: "var(--muted-foreground)",
                fontSize: 12,
              }}
            />
            <YAxis
              type="number"
              domain={yDomain}
              tickFormatter={formatValue}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              width={82}
              label={{
                value: yAxisLabel,
                angle: -90,
                position: "insideLeft",
                fill: "var(--muted-foreground)",
                fontSize: 12,
              }}
            />
            <Tooltip
              cursor={{ stroke: "var(--border)", strokeDasharray: "4 4" }}
              formatter={(value: unknown) => {
                const numberValue = asNumber(value)
                if (numberValue === null) return "—"
                return formatValue(numberValue)
              }}
              labelFormatter={(label: unknown) => {
                const timestamp = asNumber(label)
                if (timestamp === null) return "—"
                return formatAxisDateTimeLabel(timestamp)
              }}
              contentStyle={{
                borderRadius: "0.5rem",
                borderColor: "var(--border)",
                backgroundColor: "var(--card)",
              }}
              labelStyle={{ color: "var(--muted-foreground)", fontSize: 14 }}
              itemStyle={{ color: "var(--muted-foreground)", fontSize: 14 }}
            />
            <Line
              dataKey="value"
              type="monotone"
              stroke="var(--primary)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
      {hasData ? (
        <div className="pt-4 space-y-2">
          <div className="flex items-center justify-end text-xs text-muted-foreground">
            <span>
              {windowPercent >= 100
                ? "Все данные"
                : `~${formatWindowDuration(activeWindowMs)}`}
            </span>
          </div>
          <input
            type="range"
            min={MIN_WINDOW_PERCENT}
            max={100}
            step={0.01}
            value={sliderPosition}
            onChange={(event) => setWindowPercent(100 - Number(event.target.value))}
            className="timeseries-window-slider h-1.5 w-full cursor-pointer appearance-none rounded-full"
            style={sliderStyle}
            aria-label="Масштаб окна по времени"
          />
        </div>
      ) : null}
    </div>
  )
}
