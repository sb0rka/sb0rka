/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCK_API?: string
  readonly VITE_API_BASE_URL?: string
  readonly VITE_RESOURCE_API_BASE_URL?: string
  readonly VITE_QUERY_RUNNER_BASE_URL?: string
  readonly VITE_LANDING_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
