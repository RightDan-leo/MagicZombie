/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string
  readonly VITE_FIREBASE_PROJECT_ID?: string
  readonly VITE_DEFAULT_PROFILE_ID?: string
  readonly VITE_ENABLE_WEAPON_LEVEL_SYNC?: string
  readonly VITE_TELEMETRY_API_URL?: string
  readonly VITE_TELEMETRY_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
