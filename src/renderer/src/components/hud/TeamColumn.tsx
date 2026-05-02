import { useState } from 'react';
import { CP_SPRITE, type HudTeamMon } from '../../lib/hudFixtures';
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
  const hp = hpColor(mon.hp);

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
          LV {mon.lv} · {mon.role}
        </div>
        <div className="flex gap-1 mb-2">
          {mon.types.map((t) => (
            <TypeChip key={t} t={t} />
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-mono-hud text-[12px] text-[var(--ink-2)]">HP</span>
          <div className="relative h-1.5 flex-1 rounded-full bg-black/40 overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${mon.hp * 100}%`, background: hp, boxShadow: `0 0 6px ${hp}` }}
            />
          </div>
          <span className="font-mono-hud text-[12px]" style={{ color: hp }}>
            {Math.round(mon.hp * 100)}
          </span>
        </div>
      </div>

      <div
        className="relative"
        style={{
          width: 68,
          height: 78,
          transition: 'filter .25s ease, transform .25s ease',
          transform: expanded ? 'scale(1.05)' : 'scale(1)',
          filter: expanded ? 'brightness(1.1)' : 'none',
        }}
      >
        <div
          className="absolute inset-0 hex"
          style={{
            background: `linear-gradient(160deg, ${tColor}, ${tColor2})`,
            opacity: mon.hp > 0 ? 1 : 0.3,
            filter: isActive ? 'brightness(1.2) saturate(1.2)' : 'brightness(.9)',
            boxShadow: isActive ? `0 0 22px ${tColor}` : '0 6px 14px rgba(0,0,0,.4)',
          }}
        />
        <div className="absolute inset-[3px] hex" style={{ background: 'rgba(8,18,26,.9)' }} />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <img
            src={CP_SPRITE(mon.sprite)}
            alt={mon.name}
            className="sprite-img"
            style={{ width: 48, height: 48, marginTop: -4 }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
        <div className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full font-mono-hud text-[11px] font-bold bg-black/80 border border-white/20 pointer-events-none">
          {mon.lv}
        </div>
        <div className="absolute bottom-[6px] left-1/2 -translate-x-1/2 w-[60%] h-1 rounded-full bg-black/60 overflow-hidden pointer-events-none">
          <div className="h-full" style={{ width: `${mon.hp * 100}%`, background: hp }} />
        </div>
        {mon.status && (
          <div className="absolute -top-1 -left-1 w-5 h-5 rounded-full bg-[#a866c8] border border-black/40 font-mono-hud text-[11px] flex items-center justify-center uppercase font-bold pointer-events-none">
            {mon.status}
          </div>
        )}
        {isActive && (
          <div
            className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full font-mono-hud text-[10px] uppercase tracking-widest pointer-events-none"
            style={{ background: 'var(--hud-accent)', color: '#18120a', boxShadow: '0 0 10px var(--hud-accent)' }}
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
}) {
  const [hover, setHover] = useState<string | null>(null);
  const handleHover = (id: string | null) => {
    setHover(id);
    onHover?.(id);
  };
  return (
    <div className="flex flex-col gap-3 items-end">
      <div className="font-mono-hud text-[14px] uppercase tracking-[.25em] text-[var(--hud-accent-2)] mb-1">
        ◣ ACTIVE TEAM
      </div>
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
      <div className="font-mono-hud text-[12px] text-[var(--ink-2)] uppercase tracking-wider mt-2">
        6/6 · synced
      </div>
    </div>
  );
}
