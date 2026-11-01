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

export function mockSubscriptionProjects(): ProjectQuotaView[] {
  return [
    view(
      project("mock-billing", "Billing", freePlan.id, true),
      freePlan,
      rowsFor("free", {
        "dbis.count": 1,
        "dbis.max_direct_connections": 2,
        "dbis.max_pooled_connections": 8,
        "dbis.storage.bytes": 80 * mib,
        "llms.requests_per_minute": 1,
        "llms.tokens_per_minute": 400,
        "projects.members.count": 1,
        "secrets.count": 2,
        "secrets.versions.count": 1,
      }, {
        "dbis.max_direct_connections": [resource("mock-billing-dbi", "billingdbi01", 2)],
        "dbis.max_pooled_connections": [resource("mock-billing-dbi", "billingdbi01", 8)],
        "dbis.storage.bytes": [resource("mock-billing-dbi", "billingdbi01", 80 * mib)],
        "secrets.versions.count": [resource("mock-billing-secret", "billingsec01", 1)],
      }),
    ),
    view(
      project("mock-analytics", "Analytics warehouse", proPlan.id, true),
      proPlan,
      rowsFor("pro", {
        "dbis.count": 4,
        "dbis.max_direct_connections": 36,
        "dbis.max_pooled_connections": 180,
        "dbis.storage.bytes": 48 * gib,
        "llms.requests_per_minute": 22,
        "llms.tokens_per_minute": 40_000,
        "projects.members.count": 6,
        "secrets.count": 8,
        "secrets.versions.count": 7,
      }, {
        "dbis.max_direct_connections": [
          resource("mock-analytics-dbi-a", "analyticsa01", 36),
          resource("mock-analytics-dbi-b", "analyticsb01", 12),
        ],
        "dbis.max_pooled_connections": [
          resource("mock-analytics-dbi-a", "analyticsa01", 180),
          resource("mock-analytics-dbi-b", "analyticsb01", 40),
        ],
        "dbis.storage.bytes": [
          resource("mock-analytics-dbi-a", "analyticsa01", 48 * gib),
          resource("mock-analytics-dbi-b", "analyticsb01", 6 * gib),
        ],
        "secrets.versions.count": [
          resource("mock-analytics-secret-a", "analyticssa1", 7),
          resource("mock-analytics-secret-b", "analyticssb1", 2),
        ],
      }),
    ),
    view(
      project("mock-mobile", "Mobile API", proPlan.id, true),
      proPlan,
      rowsFor("pro", {
        "dbis.count": 2,
        "dbis.max_direct_connections": 14,
        "dbis.max_pooled_connections": 90,
        "dbis.storage.bytes": 6 * gib,
        "llms.requests_per_minute": 8,
        "llms.tokens_per_minute": 12_000,
        "projects.members.count": 4,
        "secrets.count": 11,
        "secrets.versions.count": 3,
      }, {
        "dbis.max_direct_connections": [resource("mock-mobile-dbi", "mobiledbi001", 14)],
        "dbis.max_pooled_connections": [resource("mock-mobile-dbi", "mobiledbi001", 90)],
        "dbis.storage.bytes": [resource("mock-mobile-dbi", "mobiledbi001", 6 * gib)],
        "secrets.versions.count": [resource("mock-mobile-secret", "mobilese0001", 3)],
      }),
    ),
    view(
      project("mock-docs", "Internal docs", freePlan.id, true),
      freePlan,
      rowsFor("free", {
        "dbis.count": 1,
        "dbis.max_direct_connections": 0,
        "dbis.max_pooled_connections": 0,
        "dbis.storage.bytes": 12 * mib,
        "llms.requests_per_minute": 0,
        "llms.tokens_per_minute": 0,
        "projects.members.count": 2,
        "secrets.count": 1,
        "secrets.versions.count": 0,
      }, {
        "dbis.max_direct_connections": [resource("mock-docs-dbi", "docsdbi0001", 0)],
        "dbis.max_pooled_connections": [resource("mock-docs-dbi", "docsdbi0001", 0)],
        "dbis.storage.bytes": [resource("mock-docs-dbi", "docsdbi0001", 12 * mib)],
        "secrets.versions.count": [resource("mock-docs-secret", "docssec00001", 0)],
      }),
    ),
    view(
      project("mock-staging", "Staging cluster", freePlan.id, false),
      freePlan,
      rowsFor("free", {
        "dbis.count": 2,
        "dbis.max_direct_connections": 6,
        "dbis.max_pooled_connections": 24,
        "dbis.storage.bytes": 200 * mib,
        "llms.requests_per_minute": 4,
        "llms.tokens_per_minute": 1_200,
        "projects.members.count": 3,
        "secrets.count": 4,
        "secrets.versions.count": 2,
      }, {
        "dbis.max_direct_connections": [resource("mock-staging-dbi", "stagingdbi01", 6)],
        "dbis.max_pooled_connections": [resource("mock-staging-dbi", "stagingdbi01", 24)],
        "dbis.storage.bytes": [resource("mock-staging-dbi", "stagingdbi01", 200 * mib)],
        "secrets.versions.count": [resource("mock-staging-secret", "stagingsec01", 2)],
      }),
    ),
  ]
}
