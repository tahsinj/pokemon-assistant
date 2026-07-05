import type { CSSProperties } from 'react';
import { CP_SPRITE, CP_SPRITE_HD, type HudTeamMon } from '../../lib/hudFixtures';
import { NATURES, STAT_LABELS } from '../../lib/stats';
import type { StatKey } from '../../lib/types';
import { TypeChip } from './HudPrimitives';

const STAT_KEYS: StatKey[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

export function FocusLens({ mon }: { mon: HudTeamMon }) {
  const tint = `var(--t-${mon.types[0]})`;
  const tint2 = `var(--t-${mon.types[1] || mon.types[0]})`;
  const bstTotal = mon.bst ?? Object.values(mon.stats).reduce((a, b) => a + b, 0);
  const maxStat = Math.max(1, ...Object.values(mon.stats));
  const statLevel = mon.statLevel ?? mon.lv ?? 100;
  const hasHp = typeof mon.hp === 'number';

  const nat = NATURES[mon.nature] || {};
  const evTotal = mon.evs ? Object.values(mon.evs).reduce((a, b) => a + b, 0) : 0;

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
        <span className="corner-tag r" style={{ color: tint2 }}>
          LV {statLevel}
        </span>
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
        <div className="lens-v-chips">
          {mon.types.map((t) => (
            <TypeChip key={t} t={t} size="md" />
          ))}
        </div>

        <div className="lens-v-kv">
          <div className="kv-cell">
            <span className="k">ABL</span>
            <span className="v">{mon.ability}</span>
          </div>
          <div className="kv-pair">
            <div className="kv-cell">
              <span className="k">NAT</span>
              <span className="v">
                {mon.nature}
                {nat.plus && <em className="nat-up"> +{STAT_LABELS[nat.plus]}</em>}
                {nat.minus && <em className="nat-down"> −{STAT_LABELS[nat.minus]}</em>}
                {!nat.plus && !nat.minus && <em className="nat-neutral"> ·</em>}
              </span>
            </div>
            <div className="kv-cell">
              <span className="k">ITM</span>
              <span className="v">{mon.item || '-'}</span>
            </div>
          </div>
        </div>

        <div className="lens-v-stats">
          <div className="row shead">
            <span className="sk" />
            <span className="shint">stat</span>
            <span className="sv" />
            <span className="ivev">
              <b className="iv">IV</b>
              <b className="ev">EV</b>
            </span>
          </div>
          {STAT_KEYS.map((k) => {
            const v = mon.stats[k];
            const iv = mon.ivs?.[k] ?? 31;
            const ev = mon.evs?.[k] ?? 0;
            const up = nat.plus === k;
            const down = nat.minus === k;
            return (
              <div key={k} className={`row${up ? ' up' : ''}${down ? ' down' : ''}`}>
                <span className="sk">{k}</span>
                <div className="sbar">
                  <i style={{ width: `${Math.min(100, (v / maxStat) * 100)}%` }} />
                </div>
                <span className="sv">{v}</span>
                <span className="ivev">
                  <b className={`iv${iv < 31 ? ' imperfect' : ''}`}>{iv}</b>
                  <b className={`ev${ev > 0 ? ' invested' : ''}`}>{ev}</b>
                </span>
              </div>
            );
          })}
          <div className="ev-total">
            EVs {evTotal}/510{evTotal > 510 ? ' ⚠' : ''}
          </div>
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
