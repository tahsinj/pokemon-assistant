/**
 * Renderer-side façade over the shared wire protocol. The single source of
 * truth lives in `src/shared/cobblemonProtocol.ts` so both the Electron main
 * process (running the WebSocket server) and the renderer (consuming
 * forwarded frames) agree on shapes.
 */

export * from '../../../../../shared/cobblemonProtocol';
