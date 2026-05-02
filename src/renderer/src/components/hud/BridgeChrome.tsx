export function BridgeChrome() {
  return (
    <div className="bridge-chrome" aria-hidden="true">
      <div className="bridge-floor" />
      <div className="bridge-vignette" />
      <div className="bridge-axis">
        <span>−30</span>
        <span>−20</span>
        <span>−10</span>
        <span style={{ color: 'var(--hud-accent)' }}>00</span>
        <span>10</span>
        <span>20</span>
        <span>30</span>
      </div>
      <div className="reticle tl" />
      <div className="reticle tr" />
      <div className="reticle bl" />
      <div className="reticle br" />
    </div>
  );
}
