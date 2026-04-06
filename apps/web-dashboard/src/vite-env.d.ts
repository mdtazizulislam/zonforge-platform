/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_API_URL?: string
	readonly VITE_API_BASE_URL?: string
	readonly VITE_APP_URL?: string
	readonly VITE_AUTH_CALLBACK_URL?: string
}

interface ImportMeta {
	readonly env: ImportMetaEnv
}
