import type { CSSProperties } from 'react';

const HEX = 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)';

export interface CoreHex {
  id: string;
  label: string;
  glyph: string;
}

/**
 * The home screen orb with one hex per entry, evenly spaced clockwise from the
 * top. Hexes grow when there are few of them.
 */
export function SyncCore<T extends string>({
  hexes,
  active,
  onPick,
  size = 480,
}: {
  hexes: (CoreHex & { id: T })[];
  active: T | null;
  onPick: (id: T) => void;
  size?: number;
}) {
  const radius = Math.round(size * 0.35);
  const scale = hexes.length <= 6 ? 1.35 : 1;
  const hexW = Math.round(size * 0.1625 * scale);
  const hexH = Math.round(size * 0.1875 * scale);
  const orbSize = Math.round(size * 0.32);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div className="core-glow" />

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
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[64px] h-[64px] rounded-full"
            style={{ background: 'radial-gradient(circle, var(--hud-accent-2) 0%, transparent 70%)', opacity: 0.7 }}
          />
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[40px] h-[46px]"
            style={{ clipPath: HEX, background: 'rgba(8,19,28,.6)' }}
          >
            <div
              className="absolute inset-[4px]"
              style={{
                clipPath: HEX,
                background:
                  'linear-gradient(135deg, #e9fff8 0%, var(--hud-accent-2) 45%, #0a6b55 100%)',
              }}
            />
          </div>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 font-mono-hud text-[14px] uppercase tracking-[.3em] text-ink-1 whitespace-nowrap">
            SYNC CORE
          </div>
        </div>
      </div>

      {hexes.map((hex, i) => {
        const rad = ((-90 + (i * 360) / hexes.length) * Math.PI) / 180;
        const x = Math.cos(rad) * radius;
        const y = Math.sin(rad) * radius;
        const isActive = hex.id === active;
        return (
          <button
            key={hex.id}
            type="button"
            className={`nav-hex ${isActive ? 'active' : ''}`}
            style={
              {
                width: hexW,
                height: hexH,
                left: `calc(50% - ${hexW / 2}px + ${x}px)`,
                top: `calc(50% - ${hexH / 2}px + ${y}px)`,
              } as CSSProperties
            }
            onClick={() => onPick(hex.id)}
            aria-label={hex.label}
          >
            <div className="hex-bg" />
            <div className="hex-stroke" />
            <div className="label flex flex-col items-center gap-0.5">
              <div className="font-display text-[22px] font-bold">{hex.glyph}</div>
              <div>{hex.label}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
