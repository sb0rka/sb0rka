export const MOCK_USER_ID = "mock-user-001"

export const MOCK_PLAN = {
  id: "plan-pro",
  name: "Pro",
  description: "Mock plan for mobile UI testing",
  db_limit: 10,
  code_limit: 50,
  function_limit: 50,
  secret_limit: 25,
  project_limit: 5,
  group_limit: 10,
  created_at: "2025-01-01T00:00:00.000Z",
  updated_at: "2025-01-01T00:00:00.000Z",
}

export const MOCK_PLANS = {
  plans: [MOCK_PLAN, {
    id: "plan-free",
    name: "Free",
    description: "Starter tier",
    db_limit: 1,
    code_limit: 5,
    function_limit: 5,
    secret_limit: 3,
    project_limit: 1,
    group_limit: 2,
    created_at: "2025-01-01T00:00:00.000Z",
    updated_at: "2025-01-01T00:00:00.000Z",
  }],
}
