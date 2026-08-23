/**
 * Shared chrome for dive-module pages (header plus
 * sprite/move primitives). Every tool page
 * renders inside a ModuleFrame: kicker/title/subtitle header with an optional
 * `side` slot, above a slanted glass panel.
 */
import { type ReactNode } from 'react';
import type { Move } from '../../lib/types';
import { spriteChain, useSpriteFallback } from '../../lib/sprites';
import { TypeChip } from './HudPrimitives';

export function ModuleFrame({
  kicker,
  title,
  subtitle,
  side,
  children,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  side?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mod-in">
      <div className="flex items-end justify-between gap-4 mb-3 px-1">
        <div className="min-w-0">
          {kicker && (
            <div className="font-mono-hud text-[14px] uppercase tracking-[.3em] text-[var(--hud-accent-2)] mb-1 whitespace-nowrap">
              {kicker}
            </div>
          )}
          <div className="font-display text-[28px] font-bold leading-none text-[var(--ink-0)]">
            {title}
          </div>
          {subtitle && (
            <div className="font-mono-hud text-[15px] text-[var(--ink-2)] mt-1.5 uppercase tracking-wider">
              {subtitle}
            </div>
          )}
        </div>
        {side && <div className="flex-shrink-0">{side}</div>}
      </div>
      <div className="glass notch rounded-[18px] p-5">{children}</div>
    </div>
  );
}

/**
 * Holographic sprite stage: scanline + floating artwork + corner monogram.
 * Falls back from official artwork to the pixel sprite, then to a glyph.
 */
export function SpriteFrame({
  dex,
  name,
  corner,
  cornerColor = 'var(--hud-accent-2)',
  className = '',
}: {
  dex: number;
  name: string;
  corner?: string;
  cornerColor?: string;
  className?: string;
}) {
  const sprite = useSpriteFallback(spriteChain(dex, 'artwork', name));
  return (
    <div className={`sprite-frame relative rounded-[14px] aspect-square overflow-hidden ${className}`}>
      <div className="scanline" />
      <div className="absolute inset-0 flex items-center justify-center float-y">
        {!sprite.exhausted ? (
          <img
            src={sprite.src}
            alt={name}
            className="sprite-img"
            style={{ width: '78%', height: '78%', objectFit: 'contain' }}
            draggable={false}
            onError={sprite.onError}
          />
        ) : (
          <span className="font-display text-[42px] font-bold text-[var(--ink-2)]">
            {(name.trim()[0] ?? '?').toUpperCase()}
          </span>
        )}
      </div>
      <div
        className="absolute top-2 left-3 font-mono-hud text-[14px] opacity-80"
        style={{ color: cornerColor }}
      >
        {corner ?? `#${String(dex).padStart(4, '0')}`}
      </div>
    </div>
  );
}

/** Type-tinted move tile (design `MoveCard`), backed by a real `Move`. */
export function MoveCard({ m, hint }: { m: Move; hint?: string }) {
  const tColor = `var(--t-${m.type.toLowerCase()})`;
  return (
    <div
      className="relative rounded-[12px] overflow-hidden border border-white/10 bg-white/[.04] hover:bg-white/[.08] transition group"
      title={hint ?? m.desc}
    >
      <div
        className="absolute inset-0 opacity-[.18] group-hover:opacity-[.30] transition"
        style={{ background: tColor }}
      />
      <div className="absolute right-2 top-2">
        <TypeChip t={m.type.toLowerCase()} />
      </div>
      <div className="relative px-3 pt-3 pb-2.5">
        <div className="font-display text-[15px] font-bold leading-tight pr-12 text-[var(--ink-0)]">
          {m.name}
        </div>
        <div className="flex items-center gap-3 mt-2 font-mono-hud text-[14px] text-[var(--ink-1)]">
          <span>
            PWR <span className="text-white">{m.power || '-'}</span>
          </span>
          <span>
            ACC <span className="text-white">{m.accuracy === true ? '-' : m.accuracy}</span>
          </span>
          <span>
            PP <span className="text-white">{m.pp}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/** Mono section header used inside module panels (design `◢ LABEL` heads). */
export function SectionHead({ label, extra }: { label: ReactNode; extra?: ReactNode }) {
  return (
    <div className="font-mono-hud text-[14px] uppercase tracking-widest text-[var(--hud-accent-2)] mb-2">
      ◢ {label}
      {extra && <span className="text-[var(--ink-2)]"> · {extra}</span>}
    </div>
  );
}

/** Round HUD search input (design header search pill). */
export function SearchPill({
  value,
  onChange,
  placeholder = 'Search…',
  width = 200,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  width?: number | string;
  ariaLabel?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel ?? placeholder}
      className="bg-black/40 border border-white/15 rounded-full px-4 py-1.5 font-mono-hud text-[15px] text-white placeholder:text-[var(--ink-2)] outline-none focus:border-[var(--hud-accent-2)]"
      style={{ width }}
    />
  );
}
