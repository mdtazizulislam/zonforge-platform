/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ADMIN_APP_URL?: string
  readonly VITE_API_BASE_URL?: string
  readonly VITE_AUTH_CALLBACK_URL?: string
  readonly VITE_LOGOUT_REDIRECT_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}