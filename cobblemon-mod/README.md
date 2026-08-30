# Cobblemon Bridge Mod

Fabric mod that bridges in-game Cobblemon battle events to the Pokémon
Assistant desktop app over a local WebSocket connection.

This directory contains a **reference scaffold**, not a complete build -
Cobblemon's event API surface evolves across releases, so the hooks here are
intended as a starting point. Adapt the version coordinates in
`build.gradle.kts` to match the Cobblemon / Minecraft / Fabric Loader versions
in your modpack.

## Architecture

```
[Cobblemon battle event]
        │
        ▼
[CobblemonBridgeMod (Fabric mod, this folder)]
        │  JSON ModBattleEventMessage (see ../src/shared/cobblemonProtocol.ts)
        ▼
[Assistant WebSocket bridge :8788]
        │  IPC frames
        ▼
[Renderer: applyEventAndPredict()]
```

## Files

| File                                                       | Purpose                                                                          |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/main/kotlin/.../CobblemonBridgeMod.kt`             | Mod entry point. Initializes the WS client and subscribes to Cobblemon events.   |
| `src/main/kotlin/.../AssistantBridge.kt`                   | Lightweight WebSocket client wrapping Java 11's `HttpClient.newWebSocketBuilder` |
| `src/main/kotlin/.../EventTranslator.kt`                   | Maps Cobblemon event objects → JSON frames matching the wire protocol.           |
| `src/main/resources/fabric.mod.json`                       | Fabric manifest.                                                                 |
| `build.gradle.kts`                                         | Reference Gradle build.                                                          |

## Configuring the connection

The mod reads `~/.pokemon-assistant.json` on startup. Example:

```json
{
  "url": "ws://127.0.0.1:8788/cobblemon",
  "reconnectMs": 2000
}
```

Default URL matches the Assistant's bridge defaults
(`DEFAULT_PROTOCOL_PORT` / `DEFAULT_PROTOCOL_PATH` in
`src/shared/cobblemonProtocol.ts`).

## Wire protocol

The full message schema lives in `../src/shared/cobblemonProtocol.ts`. The
mod sends:

1. **`hello`** immediately after connect. Identifies the build and the local
   player.
2. **`event`** for every observable battle event. The `payload.kind`
   discriminates which `ModEvent` variant is being sent.
3. **`status`** heartbeats every 15 s.
4. **`error`** if the mod fails to translate an event.

All numeric fields are integers unless documented otherwise. Status strings
match `'brn' | 'par' | 'psn' | 'tox' | 'slp' | 'frz'`. Sides are
`'player' | 'opponent'`.

## Testing without a Minecraft client

Use `npm run mod-mock-client` from the Assistant repo - it scripts a sample
battle (Garchomp KO's a revealed Tatsugiri) and exercises the full pipeline.
