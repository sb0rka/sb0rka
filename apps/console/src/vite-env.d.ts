/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCK_API?: string
  readonly VITE_AUTH_BASE_URL?: string
  readonly VITE_API_BASE_URL?: string
  readonly VITE_QUERY_RUNNER_BASE_URL?: string
  readonly VITE_LANDING_URL?: string
  readonly VITE_CONTACT_FORM_URL?: string
  readonly VITE_SHOW_INVITE_TOKEN?: string
  readonly VITE_TERMS_OF_USE_LINK?: string
  readonly VITE_PUBLIC_OFFER_LINK?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
