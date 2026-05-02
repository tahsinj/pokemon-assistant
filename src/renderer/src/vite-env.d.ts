/// <reference types="vite/client" />

export {};

declare global {
  interface Window {
    cobblemon?: import('./lib/bridgeTypes').CobblemonBridge;
  }
}
