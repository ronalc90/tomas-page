/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DATA_MODE?: "server" | "local";
  readonly VITE_APP_VERSION?: string;
}
