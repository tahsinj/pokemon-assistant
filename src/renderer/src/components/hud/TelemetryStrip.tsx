/** Bottom-left telemetry: app name and version. */
export function TelemetryStrip() {
  return (
    <div className="telemetry-strip">
      <span className="tlm">
        <span className="acc2">STAB LAB</span>
        <span style={{ opacity: 0.55 }}>v{__APP_VERSION__}</span>
      </span>
    </div>
  );
}
