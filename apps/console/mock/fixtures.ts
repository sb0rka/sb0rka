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
  quotas?: ReturnType<typeof accountQuota>[]
}) {
  return {
    ...fields,
    quotas: fields.quotas ?? [],
    is_public: true,
    is_available: true,
    created_at: STAMP,
    updated_at: STAMP,
  }
}

function accountQuota(
  code: string,
  name_en: string,
  name_ru: string,
  limit_value: number,
  unit = "count",
  kind: "snapshot" | "periodic" | "balance" = "snapshot",
) {
  return {
    id: `qd-${code}`,
    code,
    name_en,
    name_ru,
    scope: "account",
    kind,
    unit,
    window: null,
    limit_value,
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
  quotas: [
    accountQuota("llms.spend.micros", "LLM balance", "Баланс LLM", 5_000_000, "micros", "balance"),
    accountQuota("organizations.count", "Owned organizations count", "Число своих организаций", 10),
    accountQuota("organizations.members.count", "Organization members count", "Число участников организации", 25),
    accountQuota("projects.count", "Projects count", "Число проектов", 20),
    accountQuota("total.dbis.count", "Total database instances count", "Общее число инстансов БД", 10),
    accountQuota("total.secrets.count", "Total secrets count", "Общее число секретов", 200),
  ],
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
      quotas: [
        accountQuota("llms.spend.micros", "LLM balance", "Баланс LLM", 0, "micros", "balance"),
        accountQuota("organizations.count", "Owned organizations count", "Число своих организаций", 3),
        accountQuota("organizations.members.count", "Organization members count", "Число участников организации", 5),
        accountQuota("projects.count", "Projects count", "Число проектов", 2),
        accountQuota("total.dbis.count", "Total database instances count", "Общее число инстансов БД", 1),
        accountQuota("total.secrets.count", "Total secrets count", "Общее число секретов", 40),
      ],
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
    quota("secrets.versions.count", "Secret versions", "Версии секрета", "snapshot", "count", null, 40),
  ],
  "proj-beta": [
    quota("databases", "Databases", "Базы данных", "snapshot", "count", null, 3),
    quota("storage", "Storage", "Хранилище", "snapshot", "bytes", null, GIB, 256 * 1024 * 1024),
    quota("secrets.versions.count", "Secret versions", "Версии секрета", "snapshot", "count", null, 40),
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
      "secrets.versions.count": { used: 40, status: "available", unit: "count", observed_at: OBSERVED },
    },
  },
  "proj-beta": {
    id: "usage-beta",
    public_id: "proj-beta",
    usage: {
      databases: { used: 1, status: "available", unit: "count", observed_at: OBSERVED },
      storage: { used: Math.round(0.2 * GIB), status: "available", unit: "bytes", observed_at: OBSERVED },
      "secrets.versions.count": { used: 40, status: "available", unit: "count", observed_at: OBSERVED },
    },
  },
}

export const MOCK_BALANCE = {
  balances: [
    {
      credits: {
        limit: { RUB: "5000", USD: "50" },
        entitled: { RUB: "1000", USD: "10" },
        used: { RUB: "2000", USD: "20" },
        held: { RUB: "500", USD: "5" },
        available: { RUB: "3500", USD: "35" },
      },
    },
  ],
}
