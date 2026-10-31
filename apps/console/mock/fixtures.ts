export const MOCK_USER_ID = "mock-user-001"

const STAMP = "2025-01-01T00:00:00.000Z"

function plan(fields: {
  id: string
  code: string
  kind: "account" | "project"
  name_en: string
  name_ru: string
  description_en: string
  description_ru: string
}) {
  return {
    ...fields,
    is_public: true,
    is_available: true,
    created_at: STAMP,
    updated_at: STAMP,
  }
}

export const MOCK_PLAN = plan({
  id: "plan-pro",
  code: "pro",
  kind: "account",
  name_en: "Pro",
  name_ru: "Pro",
  description_en: "For teams running more than one project.",
  description_ru: "Для команд с несколькими проектами.",
})

export const MOCK_PLANS = {
  plans: [
    MOCK_PLAN,
    plan({
      id: "plan-free",
      code: "free",
      kind: "account",
      name_en: "Free",
      name_ru: "Бесплатный",
      description_en: "A single project to try the platform.",
      description_ru: "Один проект, чтобы попробовать платформу.",
    }),
  ],
}

export const MOCK_PROJECT_PLAN = plan({
  id: "plan-project-pro",
  code: "project-pro",
  kind: "project",
  name_en: "Project Pro",
  name_ru: "Проект Pro",
  description_en: "Limits applied to one project.",
  description_ru: "Лимиты одного проекта.",
})

function quota(
  code: string,
  name_en: string,
  name_ru: string,
  kind: "snapshot" | "periodic" | "balance",
  unit: string,
  window: string | null,
  limit_value: number,
  entitled = 0,
) {
  return {
    plan_id: MOCK_PROJECT_PLAN.id,
    quota_definition: {
      id: `qd-${code}`,
      name_en,
      name_ru,
      code,
      unit,
      scope: "project",
      kind,
      window,
    },
    limit_value,
    entitled,
    created_at: STAMP,
  }
}

const GIB = 1024 ** 3

export const MOCK_PROJECT_QUOTAS: Record<string, ReturnType<typeof quota>[]> = {
  "proj-alpha": [
    quota("databases", "Databases", "Базы данных", "snapshot", "count", null, 5),
    quota("storage", "Storage", "Хранилище", "snapshot", "bytes", null, 5 * GIB),
    quota("requests", "Requests", "Запросы", "periodic", "count", "hour", 10_000),
  ],
  "proj-beta": [
    quota("databases", "Databases", "Базы данных", "snapshot", "count", null, 3),
    quota("storage", "Storage", "Хранилище", "snapshot", "bytes", null, GIB, 256 * 1024 * 1024),
  ],
}

const OBSERVED = new Date(Date.now() - 4 * 60 * 1000).toISOString()

export const MOCK_PROJECT_USAGE: Record<string, { id: string; public_id: string; usage: Record<string, unknown> }> = {
  "proj-alpha": {
    id: "usage-alpha",
    public_id: "proj-alpha",
    usage: {
      databases: { used: 5, status: "available", unit: "count", observed_at: OBSERVED },
      storage: {
        used: Math.round(1.2 * GIB),
        status: "available",
        unit: "bytes",
        observed_at: OBSERVED,
        resources: [
          { id: "db-orders", public_id: "db-orders", used: Math.round(0.8 * GIB), status: "available", observed_at: OBSERVED },
          { id: "db-users", public_id: "db-users", used: Math.round(0.4 * GIB), status: "available", observed_at: OBSERVED },
        ],
      },
      requests: { used: 1200, status: "available", unit: "count", observed_at: OBSERVED, aggregation: "max" },
    },
  },
  "proj-beta": {
    id: "usage-beta",
    public_id: "proj-beta",
    usage: {
      databases: { used: 1, status: "available", unit: "count", observed_at: OBSERVED },
      storage: { used: Math.round(0.2 * GIB), status: "available", unit: "bytes", observed_at: OBSERVED },
    },
  },
}

export const MOCK_BALANCE = {
  credits: {
    limit: 5_000_000,
    entitled: 1_000_000,
    used: 2_000_000,
    held: 500_000,
    available: 3_500_000,
  },
}
