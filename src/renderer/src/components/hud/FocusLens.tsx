import type { CSSProperties } from 'react';
import { CP_SPRITE, CP_SPRITE_HD, type HudTeamMon } from '../../lib/hudFixtures';
import { TypeChip } from './HudPrimitives';

export function FocusLens({ mon }: { mon: HudTeamMon }) {
  const tint = `var(--t-${mon.types[0]})`;
  const tint2 = `var(--t-${mon.types[1] || mon.types[0]})`;
  const bstTotal = mon.bst ?? Object.values(mon.stats).reduce((a, b) => a + b, 0);
  const maxStat = Math.max(1, ...Object.values(mon.stats));
  const statBasis = mon.statsAreActual
    ? `Lv ${mon.lv ?? '?'} stats`
    : 'base stats';
  const hasHp = typeof mon.hp === 'number';

  return (
    <div className="focus-lens-v" style={{ ['--lens-tint' as string]: tint } as CSSProperties}>
      <div className="lens-v-head">
        <span className="kicker">◢ Focus · {mon.role}</span>
        {hasHp && (
          <span className="mode">
            <span className="mode-dot" />
            Live · {Math.round((mon.hp ?? 1) * 100)}%
          </span>
        )}
      </div>

      <div className="lens-v-sprite">
        <div
          className="halo"
          style={{ background: `radial-gradient(circle, ${tint}, transparent 65%)` }}
        />
        <div className="scan" aria-hidden="true" />
        <span className="corner-tag">{mon.dex}</span>
        {typeof mon.lv === 'number' && (
          <span className="corner-tag r" style={{ color: tint2 }}>
            LV {mon.lv}
          </span>
        )}
        <img
          src={CP_SPRITE_HD(mon.sprite)}
          alt={mon.name}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = CP_SPRITE(mon.sprite);
          }}
        />
      </div>

      <div className="lens-v-body">
        <div className="lens-v-name">
          {mon.name}
          <span className="lens-v-bst">BST {bstTotal}</span>
        </div>
        <div className="lens-v-sub">
          {mon.nature} · {statBasis}
        </div>
        <div className="lens-v-chips">
          {mon.types.map((t) => (
            <TypeChip key={t} t={t} size="md" />
          ))}
        </div>

        <div className="lens-v-kv">
          <div>
            <span className="k">ABL</span>
            <span className="v">{mon.ability}</span>
          </div>
          <div>
            <span className="k">ITM</span>
            <span className="v">{mon.item}</span>
          </div>
        </div>

        <div className="lens-v-stats">
          {Object.entries(mon.stats).map(([k, v]) => (
            <div key={k} className="row">
              <span className="sk">{k}</span>
              <div className="sbar">
                <i style={{ width: `${Math.min(100, (v / maxStat) * 100)}%` }} />
              </div>
              <span className="sv">{v}</span>
            </div>
          ))}
        </div>

        <div className="lens-v-moves">
          {mon.moves.map((m, i) => (
            <div
              key={i}
              className="lens-move"
              style={
                {
                  borderTopColor: `var(--t-${m.type})`,
                  ['--mv-tint' as string]: `var(--t-${m.type})`,
                } as CSSProperties
              }
            >
              <div className="mv-name">{m.name}</div>
              <div className="mv-sub">
                {m.type} · {m.pow || '-'} · {m.pp}PP
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
