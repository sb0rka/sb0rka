import type { ProjectResponse } from "@/features/projects/api"
import type { PlanResponse, QuotaDefinitionSnippet, ResourceUsage } from "./api"
import type { ProjectQuotaView } from "./hooks"
import {
  effectiveLimit,
  isNearLimit,
  thresholdLevel,
  usageRatio,
  type QuotaRowView,
} from "./quota-format"

// UI fixtures so the subscription list can be reviewed with more rows.
// They are not loaded from the API.

const observedAt = "2026-11-01T12:00:00.000Z"

function plan(code: string, nameEn: string, nameRu: string): PlanResponse {
  return {
    id: `mock-plan-${code}`,
    name_en: nameEn,
    name_ru: nameRu,
    code,
    kind: "project",
    is_public: true,
    is_available: true,
    created_at: observedAt,
    updated_at: observedAt,
  }
}

function project(publicId: string, name: string, planId: string, isActive: boolean): ProjectResponse {
  return {
    public_id: publicId,
    id: publicId,
    owner_subject_id: "mock",
    billing_subject_id: "mock",
    plan_id: planId,
    name,
    is_active: isActive,
    created_at: observedAt,
    updated_at: observedAt,
  }
}

const mib = 1024 ** 2
const gib = 1024 ** 3

interface UsageField {
  code: string
  nameEn: string
  nameRu: string
  unit: string
  window: string | null
  aggregation?: "max"
  freeLimit: number
  proLimit: number
}

const usageFields: UsageField[] = [
  { code: "dbis.count", nameEn: "Databases", nameRu: "Базы данных", unit: "count", window: null, freeLimit: 2, proLimit: 10 },
  { code: "dbis.max_direct_connections", nameEn: "Direct connections", nameRu: "Прямые подключения", unit: "count", window: null, aggregation: "max", freeLimit: 20, proLimit: 100 },
  { code: "dbis.max_pooled_connections", nameEn: "Pooled connections", nameRu: "Подключения через пул", unit: "count", window: null, aggregation: "max", freeLimit: 100, proLimit: 500 },
  { code: "dbis.storage.bytes", nameEn: "Storage", nameRu: "Хранилище", unit: "bytes", window: null, aggregation: "max", freeLimit: 512 * mib, proLimit: 50 * gib },
  { code: "llms.requests_per_minute", nameEn: "LLM requests", nameRu: "Запросы LLM", unit: "count", window: "minute", freeLimit: 20, proLimit: 60 },
  { code: "llms.tokens_per_minute", nameEn: "LLM tokens", nameRu: "Токены LLM", unit: "count", window: "minute", freeLimit: 10_000, proLimit: 100_000 },
  { code: "projects.members.count", nameEn: "Members", nameRu: "Участники", unit: "count", window: null, freeLimit: 3, proLimit: 20 },
  { code: "secrets.count", nameEn: "Secrets", nameRu: "Секреты", unit: "count", window: null, freeLimit: 10, proLimit: 50 },
  { code: "secrets.versions.count", nameEn: "Secret versions", nameRu: "Версии секрета", unit: "count", window: null, aggregation: "max", freeLimit: 5, proLimit: 20 },
]

function resource(id: string, publicId: string, used: number): ResourceUsage {
  return {
    id,
    public_id: publicId,
    used,
    status: "available",
    observed_at: observedAt,
  }
}

function quotaRow(field: UsageField, used: number, limit: number, resources?: ResourceUsage[]): QuotaRowView {
  const entitled = 0
  const effective = effectiveLimit(limit, entitled)
  const ratio = usageRatio(used, effective)
  const definition: QuotaDefinitionSnippet = {
    id: field.code,
    name_en: field.nameEn,
    name_ru: field.nameRu,
    code: field.code,
    unit: field.unit,
    scope: "project",
    kind: field.window ? "periodic" : "snapshot",
    window: field.window,
  }
  return {
    code: field.code,
    definition,
    limitValue: limit,
    entitled,
    effective,
    usage: {
      used,
      status: "available",
      unit: field.unit,
      observed_at: observedAt,
      aggregation: field.aggregation,
      resources,
    },
    ratio,
    level: thresholdLevel(ratio),
    nearLimit: isNearLimit(ratio),
  }
}

function rowsFor(
  tier: "free" | "pro",
  usedByCode: Record<string, number>,
  resourcesByCode: Record<string, ResourceUsage[]> = {},
): QuotaRowView[] {
  return usageFields.map((field) =>
    quotaRow(
      field,
      usedByCode[field.code] ?? 0,
      tier === "free" ? field.freeLimit : field.proLimit,
      resourcesByCode[field.code],
    ),
  )
}

function view(item: ProjectResponse, itemPlan: PlanResponse, rows: QuotaRowView[]): ProjectQuotaView {
  return {
    project: item,
    plan: itemPlan,
    planError: false,
    rows,
    quotasError: false,
    usageAbsent: false,
    usageError: false,
    loading: false,
    nearLimit: rows.some((row) => row.nearLimit),
    refetchPlan: () => {},
    refetchQuotas: () => {},
    refetchUsage: () => {},
  }
}

const freePlan = plan("free", "Free", "Бесплатный")
const proPlan = plan("pro", "Pro", "Pro")

type RatioBand = "low" | "mid" | "high" | "hot"

// Lower bands own most rows. >0.9 stays rare, but the draw still forces one row into each band.
const bandWeight: { band: RatioBand; weight: number }[] = [
  { band: "low", weight: 0.7 },
  { band: "mid", weight: 0.18 },
  { band: "high", weight: 0.08 },
  { band: "hot", weight: 0.04 },
]

interface MockResource {
  id: string
  publicId: string
}

interface MockProjectSpec {
  publicId: string
  name: string
  tier: "free" | "pro"
  isActive: boolean
  resources: Partial<Record<string, MockResource[]>>
}

const mockProjectSpecs: MockProjectSpec[] = [
  {
    publicId: "mock-billing",
    name: "Billing",
    tier: "free",
    isActive: true,
    resources: {
      "dbis.max_direct_connections": [{ id: "mock-billing-dbi", publicId: "billingdbi01" }],
      "dbis.max_pooled_connections": [{ id: "mock-billing-dbi", publicId: "billingdbi01" }],
      "dbis.storage.bytes": [{ id: "mock-billing-dbi", publicId: "billingdbi01" }],
      "secrets.versions.count": [{ id: "mock-billing-secret", publicId: "billingsec01" }],
    },
  },
  {
    publicId: "mock-analytics",
    name: "Analytics warehouse",
    tier: "pro",
    isActive: true,
    resources: {
      "dbis.max_direct_connections": [
        { id: "mock-analytics-dbi-a", publicId: "analyticsa01" },
        { id: "mock-analytics-dbi-b", publicId: "analyticsb01" },
      ],
      "dbis.max_pooled_connections": [
        { id: "mock-analytics-dbi-a", publicId: "analyticsa01" },
        { id: "mock-analytics-dbi-b", publicId: "analyticsb01" },
      ],
      "dbis.storage.bytes": [
        { id: "mock-analytics-dbi-a", publicId: "analyticsa01" },
        { id: "mock-analytics-dbi-b", publicId: "analyticsb01" },
      ],
      "secrets.versions.count": [
        { id: "mock-analytics-secret-a", publicId: "analyticssa1" },
        { id: "mock-analytics-secret-b", publicId: "analyticssb1" },
      ],
    },
  },
  {
    publicId: "mock-mobile",
    name: "Mobile API",
    tier: "pro",
    isActive: true,
    resources: {
      "dbis.max_direct_connections": [{ id: "mock-mobile-dbi", publicId: "mobiledbi001" }],
      "dbis.max_pooled_connections": [{ id: "mock-mobile-dbi", publicId: "mobiledbi001" }],
      "dbis.storage.bytes": [{ id: "mock-mobile-dbi", publicId: "mobiledbi001" }],
      "secrets.versions.count": [{ id: "mock-mobile-secret", publicId: "mobilese0001" }],
    },
  },
  {
    publicId: "mock-docs",
    name: "Internal docs",
    tier: "free",
    isActive: true,
    resources: {
      "dbis.max_direct_connections": [{ id: "mock-docs-dbi", publicId: "docsdbi0001" }],
      "dbis.max_pooled_connections": [{ id: "mock-docs-dbi", publicId: "docsdbi0001" }],
      "dbis.storage.bytes": [{ id: "mock-docs-dbi", publicId: "docsdbi0001" }],
      "secrets.versions.count": [{ id: "mock-docs-secret", publicId: "docssec00001" }],
    },
  },
  {
    publicId: "mock-staging",
    name: "Staging cluster",
    tier: "free",
    isActive: false,
    resources: {
      "dbis.max_direct_connections": [{ id: "mock-staging-dbi", publicId: "stagingdbi01" }],
      "dbis.max_pooled_connections": [{ id: "mock-staging-dbi", publicId: "stagingdbi01" }],
      "dbis.storage.bytes": [{ id: "mock-staging-dbi", publicId: "stagingdbi01" }],
      "secrets.versions.count": [{ id: "mock-staging-secret", publicId: "stagingsec01" }],
    },
  },
]

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

// Integer used whose ratio falls in the band. Small limits cannot hit every band.
function usedBounds(limit: number, band: RatioBand): { min: number; max: number } | null {
  if (limit <= 0) return null
  let min = 0
  let max = limit
  if (band === "low") {
    max = Math.floor((limit - 1) / 2)
  } else if (band === "mid") {
    min = Math.ceil(limit / 2)
    max = Math.floor((7 * limit - 1) / 10)
  } else if (band === "high") {
    min = Math.ceil((7 * limit) / 10)
    max = Math.floor((9 * limit) / 10)
  } else {
    min = Math.floor((9 * limit) / 10) + 1
    max = limit
  }
  if (min > max) return null
  return { min, max }
}

function rollBand(rng: () => number): RatioBand {
  const pick = rng()
  let cursor = 0
  for (const entry of bandWeight) {
    cursor += entry.weight
    if (pick < cursor) return entry.band
  }
  return "low"
}

function achievableBand(limit: number, preferred: RatioBand, hotTaken: boolean): RatioBand {
  const order: RatioBand[] = ["hot", "high", "mid", "low"]
  for (let index = order.indexOf(preferred); index < order.length; index += 1) {
    const band = order[index]
    if (band === "hot" && hotTaken) continue
    if (usedBounds(limit, band)) return band
  }
  return "low"
}

interface UsageSlot {
  publicId: string
  code: string
  limit: number
}

function assignBands(rng: () => number): Map<string, RatioBand> {
  const slots: UsageSlot[] = []
  for (const spec of mockProjectSpecs) {
    for (const field of usageFields) {
      slots.push({
        publicId: spec.publicId,
        code: field.code,
        limit: spec.tier === "free" ? field.freeLimit : field.proLimit,
      })
    }
  }

  const assigned = new Map<string, RatioBand>()
  const slotKey = (slot: UsageSlot) => `${slot.publicId}:${slot.code}`
  const projectsWithBand = new Set<string>()

  for (const band of ["hot", "high", "mid", "low"] as const) {
    const open = slots.filter((slot) => !assigned.has(slotKey(slot)) && usedBounds(slot.limit, band))
    const spread = open.filter((slot) => !projectsWithBand.has(slot.publicId))
    const pool = spread.length > 0 ? spread : open
    if (pool.length === 0) continue
    const pick = pool[randomInt(rng, 0, pool.length - 1)]
    assigned.set(slotKey(pick), band)
    projectsWithBand.add(pick.publicId)
  }

  const hotByProject = new Map<string, number>()
  for (const [key, band] of assigned) {
    if (band !== "hot") continue
    const publicId = key.slice(0, key.indexOf(":"))
    hotByProject.set(publicId, (hotByProject.get(publicId) ?? 0) + 1)
  }

  for (const slot of slots) {
    const key = slotKey(slot)
    if (assigned.has(key)) continue
    const band = achievableBand(slot.limit, rollBand(rng), (hotByProject.get(slot.publicId) ?? 0) >= 1)
    assigned.set(key, band)
    if (band === "hot") hotByProject.set(slot.publicId, (hotByProject.get(slot.publicId) ?? 0) + 1)
  }

  return assigned
}

function resourceUsages(templates: MockResource[], used: number, rng: () => number): ResourceUsage[] {
  const peak = randomInt(rng, 0, templates.length - 1)
  return templates.map((template, index) =>
    resource(template.id, template.publicId, index === peak ? used : randomInt(rng, 0, used)),
  )
}

function buildMockSubscriptionProjects(rng: () => number): ProjectQuotaView[] {
  const bands = assignBands(rng)
  return mockProjectSpecs.map((spec) => {
    const usedByCode: Record<string, number> = {}
    const resourcesByCode: Record<string, ResourceUsage[]> = {}
    const itemPlan = spec.tier === "free" ? freePlan : proPlan
    for (const field of usageFields) {
      const limit = spec.tier === "free" ? field.freeLimit : field.proLimit
      const band = bands.get(`${spec.publicId}:${field.code}`) ?? "low"
      const bounds = usedBounds(limit, band) ?? { min: 0, max: 0 }
      const used = randomInt(rng, bounds.min, bounds.max)
      usedByCode[field.code] = used
      const templates = spec.resources[field.code]
      if (templates && templates.length > 0) {
        resourcesByCode[field.code] = resourceUsages(templates, used, rng)
      }
    }
    return view(
      project(spec.publicId, spec.name, itemPlan.id, spec.isActive),
      itemPlan,
      rowsFor(spec.tier, usedByCode, resourcesByCode),
    )
  })
}

// One draw per page load, so a re-render does not reshuffle the list.
let cachedMockProjects: ProjectQuotaView[] | undefined

export function mockSubscriptionProjects(): ProjectQuotaView[] {
  cachedMockProjects ??= buildMockSubscriptionProjects(mulberry32(Math.floor(Math.random() * 0x7fffffff)))
  return cachedMockProjects
}
