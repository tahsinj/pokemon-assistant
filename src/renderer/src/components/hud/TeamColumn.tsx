import { useState } from 'react';
import { type HudTeamMon } from '../../lib/hudFixtures';
import { spriteChain, useSpriteFallback } from '../../lib/sprites';
import { TypeChip } from './HudPrimitives';

function hpColor(hp: number): string {
  if (hp > 0.5) return '#7cd87b';
  if (hp > 0.25) return '#ffb84d';
  return '#ff5b6c';
}

function TeamSlot({
  mon,
  isActive,
  expanded,
  onHover,
  onClick,
}: {
  mon: HudTeamMon;
  isActive: boolean;
  expanded: boolean;
  onHover: (id: string | null) => void;
  onClick: () => void;
}) {
  const tColor = `var(--t-${mon.types[0]})`;
  const tColor2 = `var(--t-${mon.types[1] || mon.types[0]})`;
  const hasHp = typeof mon.hp === 'number';
  const hpFrac = mon.hp ?? 1;
  const hp = hpColor(hpFrac);
  const sprite = useSpriteFallback(spriteChain(mon.sprite, 'pixel', mon.name));

  // Note: hex stays put; only the info card moves. Sliding the hex caused
  // the cursor to leave the hover region, looping hover state and jittering.
  return (
    <div
      className="relative cursor-pointer"
      onMouseEnter={() => onHover(mon.id)}
      onMouseLeave={() => onHover(null)}
      onClick={onClick}
    >
      <div
        className="absolute top-1/2 w-[180px] glass rounded-[12px] notch px-3 py-2 pointer-events-none"
        style={{
          right: 'calc(100% + 14px)',
          opacity: expanded ? 1 : 0,
          transform: `translate(${expanded ? 0 : 12}px, -50%)`,
          transition: 'opacity .25s ease, transform .35s cubic-bezier(.34, 1.56, .64, 1)',
          zIndex: 10,
        }}
      >
        <div className="font-display text-[15px] font-bold flex items-center justify-between">
          {mon.name}
          <span className="font-mono-hud text-[13px] text-[var(--ink-2)]">{mon.dex}</span>
        </div>
        <div className="font-mono-hud text-[12px] text-[var(--ink-2)] uppercase tracking-wider mb-1.5">
          {typeof mon.lv === 'number' ? `LV ${mon.lv} · ${mon.role}` : mon.role}
        </div>
        <div className="flex gap-1 mb-2">
          {mon.types.map((t) => (
            <TypeChip key={t} t={t} />
          ))}
        </div>
        {hasHp && (
          <div className="flex items-center gap-1.5">
            <span className="font-mono-hud text-[12px] text-[var(--ink-2)]">HP</span>
            <div className="relative h-1.5 flex-1 rounded-full bg-black/40 overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${hpFrac * 100}%`, background: hp, boxShadow: `0 0 6px ${hp}` }}
              />
            </div>
            <span className="font-mono-hud text-[12px]" style={{ color: hp }}>
              {Math.round(hpFrac * 100)}
            </span>
          </div>
        )}
      </div>

      {/* Hex, HP bar, and (lead only) LEAD tag stack in normal flow - nothing
          absolute below the hex, so slots can never collide. Badges stay
          pinned inside the hex corners. */}
      <div className="flex flex-col items-center" style={{ width: 64 }}>
        <div
          className="relative"
          style={{
            width: 60,
            height: 68,
            transition: 'filter .25s ease, transform .25s ease',
            transform: expanded ? 'scale(1.05)' : 'scale(1)',
            filter: expanded ? 'brightness(1.1)' : 'none',
          }}
        >
          <div
            className="absolute inset-0 hex"
            style={{
              background: `linear-gradient(160deg, ${tColor}, ${tColor2})`,
              opacity: hpFrac > 0 ? 1 : 0.3,
              filter: isActive ? 'brightness(1.2) saturate(1.2)' : 'brightness(.9)',
              boxShadow: isActive ? `0 0 22px ${tColor}` : '0 6px 14px rgba(0,0,0,.4)',
            }}
          />
          <div className="absolute inset-[3px] hex" style={{ background: 'rgba(8,18,26,.9)' }} />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {sprite.exhausted ? (
              <span className="font-display font-bold text-[var(--ink-2)]" style={{ fontSize: 18 }}>
                {(mon.name.trim()[0] ?? '?').toUpperCase()}
              </span>
            ) : (
              <img
                src={sprite.src}
                alt={mon.name}
                className="sprite-img"
                style={{ width: 40, height: 40 }}
                onError={sprite.onError}
              />
            )}
          </div>
          {typeof mon.lv === 'number' && (
            <div className="absolute top-0.5 right-0.5 px-1 py-0.5 rounded-full font-mono-hud text-[10px] leading-none font-bold bg-black/80 border border-white/20 pointer-events-none">
              {mon.lv}
            </div>
          )}
          {mon.status && (
            <div className="absolute top-0.5 left-0.5 px-1 py-0.5 rounded-full bg-[#a866c8] border border-black/40 font-mono-hud text-[9px] leading-none flex items-center justify-center uppercase font-bold pointer-events-none">
              {mon.status}
            </div>
          )}
        </div>
        {hasHp && (
          <div className="w-[44px] h-1 rounded-full bg-black/60 overflow-hidden mt-1 pointer-events-none">
            <div
              className="h-full rounded-full"
              style={{ width: `${hpFrac * 100}%`, background: hp, boxShadow: `0 0 6px ${hp}` }}
            />
          </div>
        )}
        {isActive && (
          <div
            className="mt-1 px-2 py-0.5 rounded-full font-mono-hud text-[10px] leading-none uppercase tracking-widest pointer-events-none"
            style={{
              background: 'var(--hud-accent)',
              color: '#18120a',
              boxShadow: '0 0 10px var(--hud-accent)',
            }}
          >
            LEAD
          </div>
        )}
      </div>
    </div>
  );
}

export function TeamColumn({
  team,
  activeId,
  onPick,
  onHover,
}: {
  team: HudTeamMon[];
  activeId: string;
  onPick: (id: string) => void;
  onHover?: (id: string | null) => void;
  /** True when the mod bridge is connected and this party mirrors the game. */
}) {
  const [hover, setHover] = useState<string | null>(null);
  const handleHover = (id: string | null) => {
    setHover(id);
    onHover?.(id);
  };
  // No header here: the squad count pill in the top row labels this rail.
  return (
    <div className="flex flex-col gap-1.5 items-end">
      {team.map((mon) => (
        <TeamSlot
          key={mon.id}
          mon={mon}
          isActive={mon.id === activeId}
          expanded={hover === mon.id}
          onHover={handleHover}
          onClick={() => onPick(mon.id)}
        />
      ))}
      <div
        className="font-mono-hud text-[12px] text-[var(--ink-2)] uppercase tracking-wider mt-1"
        title="Your saved squad from the Team Builder"
      >
        {team.length}/6 · squad
      </div>
    </div>
  );
}
