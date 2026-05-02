export function TelemetryStrip({ biomeName }: { biomeName: string }) {
  return (
    <div className="telemetry-strip">
      <span className="tlm">
        <span className="acc2">COBBLEMON+</span>
        <span style={{ opacity: 0.55 }}>v0.2.0</span>
      </span>
      <span className="sep" />
      <span className="tlm">
        <span className="pip" />
        MOD LINK · ACTIVE · 11MS
      </span>
      <span className="sep" />
      <span className="tlm">
        <span style={{ opacity: 0.55 }}>BIOME</span>
        <span className="acc2">{biomeName}</span>
      </span>
    </div>
  );
}
