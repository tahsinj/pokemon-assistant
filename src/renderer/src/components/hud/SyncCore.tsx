import type { CSSProperties } from 'react';
import type { HudTool } from '../../lib/hudFixtures';

export function SyncCore({
  tools,
  active,
  onPick,
  size = 480,
}: {
  tools: HudTool[];
  active: string | null;
  onPick: (id: string) => void;
  size?: number;
}) {
  const radius = Math.round(size * 0.35);
  const hexW = Math.round(size * 0.1625);
  const hexH = Math.round(size * 0.1875);
  const orbSize = Math.round(size * 0.32);
  // Dashed guide ring tracks the hex geometry (the old fixed inset floated it
  // outside the hexes as `size` scaled). Sit it just inside the hex outer edge
  // so the hexes read as resting on the ring.
  const ringInset = Math.round(size / 2 - radius - hexH * 0.34);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div className="core-glow" />

      <div
        className="core-ring spin-slower"
        style={{ inset: ringInset, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,.10)' }}
      />
      <div className="core-ring solid spin-slow" style={{ inset: 78 }} />
      <div
        className="absolute"
        style={{
          inset: 50,
          borderRadius: '50%',
          background:
            'conic-gradient(from 0deg, transparent 0 8deg, rgba(255,255,255,.18) 8deg 10deg, transparent 10deg 53deg, rgba(255,255,255,.18) 53deg 55deg, transparent 55deg)',
          WebkitMask: 'radial-gradient(circle, transparent 60%, black 60.5%, black 64%, transparent 64.5%)',
          mask: 'radial-gradient(circle, transparent 60%, black 60.5%, black 64%, transparent 64.5%)',
        }}
      />

      {/* Central orb */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative breathe" style={{ width: orbSize, height: orbSize }}>
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: 'radial-gradient(circle at 35% 28%, #fff7e0, var(--hud-accent) 35%, #6e4408 95%)',
              boxShadow:
                '0 0 30px var(--hud-accent), inset 0 -18px 30px rgba(0,0,0,.4), inset 0 14px 20px rgba(255,255,255,.5)',
            }}
          />
          <div
            className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[14px]"
            style={{
              background: 'linear-gradient(180deg, rgba(0,0,0,.5), rgba(0,0,0,.85))',
              borderTop: '1px solid rgba(255,255,255,.2)',
              borderBottom: '1px solid rgba(0,0,0,.6)',
            }}
          />
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[42px] h-[42px] rounded-full pulse-ring"
            style={{
              background: 'radial-gradient(circle at 35% 30%, #fff, #aaa 50%, #222)',
              border: '3px solid #08131c',
              boxShadow: 'inset 0 -4px 8px rgba(0,0,0,.5), 0 4px 10px rgba(0,0,0,.6)',
              color: 'var(--hud-accent-2)',
            }}
          >
            <div
              className="absolute inset-[7px] rounded-full"
              style={{
                background: 'radial-gradient(circle at 35% 30%, #fff, var(--hud-accent-2) 70%, #074739)',
                boxShadow: '0 0 12px var(--hud-accent-2)',
              }}
            />
          </div>
          <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 font-mono-hud text-[14px] uppercase tracking-[.3em] text-[var(--ink-1)] whitespace-nowrap">
            SYNC CORE
          </div>
        </div>
      </div>

      {/* Radial hex tools */}
      {tools.map((tool) => {
        const rad = (tool.angle * Math.PI) / 180;
        const x = Math.cos(rad) * radius;
        const y = Math.sin(rad) * radius;
        const isActive = tool.id === active;
        return (
          <button
            key={tool.id}
            type="button"
            className={`nav-hex ${isActive ? 'active' : ''} has-tip`}
            style={
              {
                width: hexW,
                height: hexH,
                left: `calc(50% - ${hexW / 2}px + ${x}px)`,
                top: `calc(50% - ${hexH / 2}px + ${y}px)`,
              } as CSSProperties
            }
            onClick={() => onPick(tool.id)}
            aria-label={tool.label}
          >
            <div className="hex-bg" />
            <div className="hex-stroke" />
            <div className="label flex flex-col items-center gap-0.5">
              <div className="font-display text-[18px] font-bold">{tool.glyph}</div>
              <div>{tool.label}</div>
            </div>
            <div className="tip">{tool.label}</div>
          </button>
        );
      })}
    </div>
  );
}
