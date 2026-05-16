/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_BUILD_LABEL: string;
  readonly VITE_APP_BUILD_COMMIT: string;
  readonly VITE_APP_BUILD_RUN: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_FORCE_DEMO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

