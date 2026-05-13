import type { ModBridgeStatus } from '../../lib/bridgeTypes';

/**
 * Bottom-left telemetry: app version + the real companion-mod link state.
 * The WebSocket bridge lives in the Electron main process; status frames
 * arrive over IPC. `null` status = running outside Electron.
 */
export function TelemetryStrip({ bridgeStatus }: { bridgeStatus: ModBridgeStatus | null }) {
  const kind = bridgeStatus?.kind ?? 'idle';
  const label =
    kind === 'connected'
      ? `MOD LINK · CONNECTED${bridgeStatus?.kind === 'connected' && bridgeStatus.hello ? ` · ${bridgeStatus.hello.minecraftVersion}` : ''}`
      : kind === 'listening'
        ? 'MOD LINK · WAITING FOR MINECRAFT'
        : kind === 'error'
          ? 'MOD LINK · ERROR'
          : 'MOD LINK · OFF - START IN LIVE TAB';
  const pipColor =
    kind === 'connected'
      ? '#7cd87b'
      : kind === 'listening'
        ? 'var(--hud-accent)'
        : kind === 'error'
          ? 'var(--hud-danger)'
          : 'var(--ink-2)';
  return (
    <div className="telemetry-strip">
      <span className="tlm">
        <span className="acc2">COBBLEMON+</span>
        <span style={{ opacity: 0.55 }}>v0.2.0</span>
      </span>
      <span className="sep" />
      <span
        className="tlm"
        title="Link between this app and the companion Minecraft mod. Start it from the Live Battle Tracker to stream battles in."
      >
        <span className="pip" style={{ background: pipColor, boxShadow: `0 0 8px ${pipColor}` }} />
        {label}
      </span>
    </div>
  );
}
