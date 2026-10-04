/// <reference types="vite/client" />

export {};

declare global {
  /** package.json version, inlined at build time. */
  const __APP_VERSION__: string;

  interface Window {
    assistant?: import('./lib/bridgeTypes').AssistantApi;
  }
}
