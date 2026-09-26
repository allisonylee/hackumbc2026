/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Chat backend origin, e.g. https://api.example.com (set at build time in App Platform). Optional in dev. */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
