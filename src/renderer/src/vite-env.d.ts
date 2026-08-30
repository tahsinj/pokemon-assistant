/// <reference types="vite/client" />

export {};

declare global {
  interface Window {
    assistant?: import('./lib/bridgeTypes').AssistantApi;
  }
}
