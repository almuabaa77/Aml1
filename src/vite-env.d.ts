/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_VAPID_KEY: string;
  readonly VITE_AGORA_APP_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
