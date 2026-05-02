import { useMemo, useState } from 'react';
import type { Pokemon, BaseStats, StatKey } from '../lib/types';
import { SpeciesList } from '../components/SpeciesList';
import { NATURES, calcAllStats, STAT_LABELS } from '../lib/stats';

const ZERO: BaseStats = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const MAX_IVS: BaseStats = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const ORDER: StatKey[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

const PRESETS: Record<string, { nature: string; evs: BaseStats; note: string }> = {
  'Physical Sweeper': {
    nature: 'Jolly',
    evs: { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 },
    note: 'Max Atk + Spe, Jolly for speed tie advantage. Classic sweeper.',
  },
  'Physical Sweeper (Adamant)': {
    nature: 'Adamant',
    evs: { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 },
    note: 'Max Atk + Spe, Adamant trades outspeed for more damage.',
  },
  'Special Sweeper': {
    nature: 'Timid',
    evs: { hp: 4, atk: 0, def: 0, spa: 252, spd: 0, spe: 252 },
    note: 'Max SpA + Spe, Timid for speed tie advantage.',
  },
  'Special Sweeper (Modest)': {
    nature: 'Modest',
    evs: { hp: 4, atk: 0, def: 0, spa: 252, spd: 0, spe: 252 },
    note: 'Modest trades outspeed for more nuke power.',
  },
  'Physical Wall': {
    nature: 'Impish',
    evs: { hp: 252, atk: 0, def: 252, spa: 0, spd: 4, spe: 0 },
    note: 'Max HP + Def, Impish. Eats physical hits.',
  },
  'Special Wall': {
    nature: 'Calm',
    evs: { hp: 252, atk: 0, def: 4, spa: 0, spd: 252, spe: 0 },
    note: 'Max HP + SpD, Calm. Sponges special attackers.',
  },
  'Bulky Attacker': {
    nature: 'Adamant',
    evs: { hp: 252, atk: 252, def: 0, spa: 0, spd: 4, spe: 0 },
    note: 'Max HP + Atk. Trade speed for bulk and damage.',
  },
};

export function PlannerPage({ pokemon }: { pokemon: Pokemon[] }) {
  const [species, setSpecies] = useState<Pokemon | null>(pokemon[0] || null);
  const [level, setLevel] = useState(50);
  const [nature, setNature] = useState('Hardy');
  const [evs, setEvs] = useState<BaseStats>(ZERO);
  const [ivs, setIvs] = useState<BaseStats>(MAX_IVS);

  const evTotal = ORDER.reduce((a, k) => a + evs[k], 0);
  const computed = useMemo(
    () => (species ? calcAllStats(species.baseStats, ivs, evs, level, nature) : null),
    [species, ivs, evs, level, nature],
  );

  const setEv = (k: StatKey, v: number) => {
    const clamped = Math.max(0, Math.min(252, v));
    const others = ORDER.filter((o) => o !== k).reduce((a, o) => a + evs[o], 0);
    const final = Math.min(clamped, 510 - others);
    setEvs({ ...evs, [k]: final });
  };
  const setIv = (k: StatKey, v: number) => setIvs({ ...ivs, [k]: Math.max(0, Math.min(31, v)) });

  const applyPreset = (name: string) => {
    const p = PRESETS[name];
    setNature(p.nature);
    setEvs(p.evs);
    setIvs(MAX_IVS);
  };

  return (
    <div>
      <h1 className="page-title">EV / IV Planner</h1>
      <p className="page-sub">Pick a species, set EVs/IVs/nature/level, see live-computed stats. Use presets for classic builds.</p>
      <div className="page-grid">
        <div className="panel">
          <SpeciesList pokemon={pokemon} selectedId={species?.id} onSelect={setSpecies} />
        </div>
        <div className="panel">
          {species && computed && (
            <>
              <h3 style={{ marginTop: 0 }}>{species.name}</h3>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                <label>Level <input type="number" min={1} max={100} value={level} onChange={(e) => setLevel(+e.target.value || 1)} style={{ width: 60 }} /></label>
                <label>Nature{' '}
                  <select value={nature} onChange={(e) => setNature(e.target.value)}>
                    {Object.entries(NATURES).map(([n, v]) => (
                      <option key={n} value={n}>
                        {n}{v.plus ? ` (+${STAT_LABELS[v.plus]} −${STAT_LABELS[v.minus!]})` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <span style={{ color: evTotal > 510 ? 'var(--danger)' : 'var(--fg-dim)' }}>
                  EVs: {evTotal} / 510
                </span>
              </div>
              {evTotal > 510 && (
                <span className="ev-warning" role="status">
                  Total EVs exceed 510 - trim values until the total is 510 or less.
                </span>
              )}

              <div className="section-head">Presets</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {Object.entries(PRESETS).map(([name, p]) => (
                  <button key={name} type="button" className="tooltip" onClick={() => applyPreset(name)}>
                    {name}<span className="tip">{p.note}</span>
                  </button>
                ))}
              </div>

              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: 'var(--fg-dim)', textAlign: 'left' }}>
                    <th>Stat</th><th>Base</th><th>IV</th><th>EV</th><th>Final</th>
                  </tr>
                </thead>
                <tbody>
                  {ORDER.map((k) => (
                    <tr key={k}>
                      <td>{STAT_LABELS[k]}</td>
                      <td>{species.baseStats[k]}</td>
                      <td><input type="number" min={0} max={31} value={ivs[k]} onChange={(e) => setIv(k, +e.target.value)} className="ev-input" /></td>
                      <td><input type="number" min={0} max={252} step={4} value={evs[k]} onChange={(e) => setEv(k, +e.target.value)} className="ev-input" /></td>
                      <td style={{
                        color: NATURES[nature]?.plus === k ? 'var(--ok)'
                          : NATURES[nature]?.minus === k ? 'var(--danger)'
                          : undefined,
                        fontWeight: 600,
                      }}>{computed[k]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 12, fontSize: 11, color: 'var(--fg-dim)' }}>
                EV yield from defeating this species: {Object.entries(species.evYield || {}).filter(([,v]) => v).map(([k,v]) => `+${v} ${k}`).join(', ') || 'none'}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
