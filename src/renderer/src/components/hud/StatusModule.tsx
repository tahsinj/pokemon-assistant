import type { ReactNode } from 'react';
import { CP_SPRITE, CP_SPRITE_HD, type HudActiveCreature, type HudType } from '../../lib/hudFixtures';
import { TypeChip, StatBar, KVCard } from './HudPrimitives';

function MoveCard({ m }: { m: HudActiveCreature['moves'][number] }) {
  return (
    <div
      className="relative rounded-[12px] p-3 border border-white/10"
      style={{
        background: `linear-gradient(180deg, color-mix(in oklab, var(--t-${m.type}) 28%, transparent), rgba(255,255,255,.02))`,
      }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="font-display text-[14px] font-bold">{m.name}</div>
        <TypeChip t={m.type} />
      </div>
      <div className="grid grid-cols-3 gap-1 mt-1">
        <div className="mono-panel px-1.5 py-0.5 rounded-[5px] text-center">
          <div className="text-[10px] uppercase opacity-60">PWR</div>
          <div className="text-[13px] text-white leading-none">{m.pow || '-'}</div>
        </div>
        <div className="mono-panel px-1.5 py-0.5 rounded-[5px] text-center">
          <div className="text-[10px] uppercase opacity-60">ACC</div>
          <div className="text-[13px] text-white leading-none">{m.acc}</div>
        </div>
        <div className="mono-panel px-1.5 py-0.5 rounded-[5px] text-center">
          <div className="text-[10px] uppercase opacity-60">PP</div>
          <div className="text-[13px] text-white leading-none">{m.pp}</div>
        </div>
      </div>
    </div>
  );
}

function ModuleFrame({
  kicker,
  title,
  subtitle,
  side,
  children,
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  side?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-end justify-between mb-3 px-1">
        <div>
          {kicker && (
            <div className="font-mono-hud text-[12px] uppercase tracking-[.3em] text-[var(--hud-accent-2)] mb-1">
              {kicker}
            </div>
          )}
          <div className="font-display text-[28px] font-bold leading-none">{title}</div>
          {subtitle && (
            <div className="font-mono-hud text-[14px] text-[var(--ink-2)] mt-1.5 uppercase tracking-wider">
              {subtitle}
            </div>
          )}
        </div>
        {side}
      </div>
      <div className="glass notch rounded-[18px] p-5">{children}</div>
    </div>
  );
}

export function StatusModule({ creature }: { creature: HudActiveCreature }) {
  const tColor = `var(--t-${creature.types[0] as HudType})`;
  const tColor2 = `var(--t-${(creature.types[1] || creature.types[0]) as HudType})`;
  const bst = Object.values(creature.stats).reduce((a, b) => a + b, 0);

  return (
    <ModuleFrame
      kicker="◢ LEAD CREATURE"
      title={creature.name}
      subtitle={`${creature.dex} · LV ${creature.lv} · ${creature.nature}`}
      side={
        <div className="flex gap-1.5">
          {creature.types.map((t) => (
            <TypeChip key={t} t={t} size="md" />
          ))}
        </div>
      }
    >
      <div className="grid grid-cols-[260px_1fr] gap-5">
        <div className="sprite-frame relative rounded-[16px] aspect-square overflow-hidden">
          <div className="scanline" />
          <div className="absolute inset-0 flex items-center justify-center float-y">
            <img
              src={CP_SPRITE_HD(creature.sprite)}
              alt={creature.name}
              className="sprite-img"
              style={{ width: '78%', height: '78%', objectFit: 'contain' }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = CP_SPRITE(creature.sprite);
              }}
            />
          </div>
          <div className="absolute top-2 left-3 font-mono-hud text-[14px] text-[var(--hud-accent-2)]/80">
            {creature.dex}
          </div>
          <div className="absolute bottom-2 right-3 font-mono-hud text-[12px] text-[var(--ink-2)] uppercase tracking-wider">
            HOLO · v0.2
          </div>
          <div
            className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-[70%] h-12 rounded-[50%] blur-2xl"
            style={{ background: `linear-gradient(90deg, ${tColor}, ${tColor2})`, opacity: 0.55 }}
          />
        </div>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-3">
            <KVCard k="Ability" v={creature.ability} />
            <KVCard k="Item" v={creature.item} />
            <KVCard k="Nature" v={creature.nature} />
          </div>
          <div className="mono-panel p-3 rounded-[10px]">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[14px] uppercase tracking-widest text-[var(--hud-accent-2)]">BASE STATS</div>
              <div className="text-[14px] text-[var(--ink-2)]">BST {bst}</div>
            </div>
            <div className="flex flex-col gap-1">
              {Object.entries(creature.stats).map(([k, v]) => (
                <StatBar
                  key={k}
                  label={k}
                  value={v}
                  max={180}
                  color={
                    v >= 100
                      ? 'linear-gradient(90deg,#7cd87b,var(--hud-accent-2))'
                      : v >= 70
                        ? 'linear-gradient(90deg,var(--hud-accent),var(--hud-accent-2))'
                        : 'linear-gradient(90deg,#ff7e8d,var(--hud-accent))'
                  }
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="font-mono-hud text-[14px] uppercase tracking-widest text-[var(--hud-accent-2)] mb-2">
          ◢ MOVESET
        </div>
        <div className="grid grid-cols-4 gap-2.5">
          {creature.moves.map((m, i) => (
            <MoveCard key={i} m={m} />
          ))}
        </div>
      </div>
    </ModuleFrame>
  );
}
