import type { CSSProperties, ReactNode } from 'react';
import type { HudType } from '../../lib/hudFixtures';

export function TypeChip({
  t,
  size = 'sm',
  fill = false,
}: {
  t: HudType | string;
  size?: 'sm' | 'md';
  /** Stretch to the parent's width (equal chips in grid layouts). */
  fill?: boolean;
}) {
  const px = size === 'md' ? 'px-2.5 py-0.5 text-[11px]' : 'px-2 py-0 text-[9px]';
  return (
    <span
      className={`tchip ${px}${fill ? ' tchip-fill' : ''}`}
      style={{ '--tc': `var(--t-${t})` } as CSSProperties}
    >
      {t}
    </span>
  );
}

export function StatBar({
  value,
  max = 255,
  color,
  label,
  num,
}: {
  value: number;
  max?: number;
  color?: string;
  label: string;
  num?: number | string;
}) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="w-9 font-mono-hud text-[14px] text-ink-1 uppercase tracking-wider">{label}</div>
      <div className="font-mono-hud text-[16px] w-8 text-right text-ink-0">{num ?? value}</div>
      <div className="statbar flex-1">
        <div
          className="fill"
          style={{
            width: `${pct}%`,
            background: color || 'linear-gradient(90deg, var(--hud-accent), var(--hud-accent-2))',
          }}
        />
        <div className="ticks" />
      </div>
    </div>
  );
}

export function Hex({
  children,
  className = '',
  style,
}: {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`hex relative ${className}`} style={style}>
      {children}
    </div>
  );
}

export function KVCard({ k, v }: { k: string; v: string }) {
  return (
    <div className="px-3 py-2 rounded-[10px] border border-white/10 bg-white/[.04]">
      <div className="font-mono-hud text-[12px] uppercase tracking-wider text-ink-2">{k}</div>
      <div className="font-display text-[15px] font-semibold mt-0.5 truncate">{v}</div>
    </div>
  );
}
