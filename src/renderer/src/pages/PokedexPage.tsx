import { useState } from 'react';
import type { Pokemon, Move } from '../lib/types';
import { SpeciesList } from '../components/SpeciesList';
import { TypeBadge } from '../components/TypeBadge';
import { StatBars } from '../components/StatBars';
import { bst } from '../lib/stats';
import { suggestMoveset } from '../lib/recommender';
import { defensiveProfile } from '../lib/typechart';
import { getMergedSpecies } from '../lib/battle/dex';
import { summarizeSpeciesDivergence } from '../lib/battle/overrides';
import { PokemonSprite } from '../components/PokemonSprite';

export function PokedexPage({
  pokemon,
  moves,
}: { pokemon: Pokemon[]; moves: Record<string, Move> }) {
  const [selected, setSelected] = useState<Pokemon | null>(pokemon[0] || null);
  return (
    <div>
      <h1 className="page-title">Pokédex</h1>
      <p className="page-sub">Browse species, stats, abilities, learnsets, and recommended movesets.</p>
      <div className="page-grid">
        <div className="panel">
          <SpeciesList pokemon={pokemon} selectedId={selected?.id} onSelect={setSelected} />
        </div>
        <div className="panel">
          {selected && <PokemonDetail p={selected} moves={moves} />}
        </div>
      </div>
    </div>
  );
}

function PokemonDetail({ p, moves }: { p: Pokemon; moves: Record<string, Move> }) {
  const suggested = suggestMoveset(p, moves);
  const prof = defensiveProfile(p.types);
  const weaks = Object.entries(prof).filter(([, m]) => m > 1).sort((a, b) => b[1] - a[1]);
  const resists = Object.entries(prof).filter(([, m]) => m < 1 && m > 0).sort((a, b) => a[1] - b[1]);
  const immunes = Object.entries(prof).filter(([, m]) => m === 0);
  const learnable = p.moves
    .map((lm) => ({ learn: lm.learn, mv: moves[lm.move] }))
    .filter((x) => x.mv);
  return (
    <div>
      <div className="pokedex-species-heading">
        <PokemonSprite dex={p.dex} name={p.name} size="lg" variant="artwork" />
        <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 650, letterSpacing: '-0.02em' }}>
          #{String(p.dex).padStart(4, '0')} {p.name}
        </h2>
        {p.types.map((t) => <TypeBadge key={t} type={t} />)}
        <CobblemonOverrideBadge name={p.name} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <div className="section-head">Base stats (BST {bst(p.baseStats)})</div>
          <StatBars stats={p.baseStats} />
          <div className="section-head">Abilities</div>
          <div>
            {p.abilities.filter((a) => !p.hiddenAbilities.includes(a)).map((a) => (
              <span className="pill" key={a}>{a}</span>
            ))}
            {p.hiddenAbilities.map((a) => (
              <span className="pill" key={a} style={{ borderLeft: '2px solid var(--accent-alt-2)' }}>{a} (H)</span>
            ))}
          </div>
          <div className="section-head">Height / Weight</div>
          <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>
            {(p.height / 10).toFixed(1)}m · {(p.weight / 10).toFixed(1)}kg
          </div>
        </div>
        <div>
          <div className="section-head">Type matchups (defending)</div>
          {weaks.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <span style={{ color: 'var(--danger)', fontSize: 11 }}>Weak to: </span>
              {weaks.map(([t, m]) => (
                <span key={t} style={{ fontSize: 11, marginRight: 6 }}>
                  <TypeBadge type={t} /> ×{m}
                </span>
              ))}
            </div>
          )}
          {resists.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <span style={{ color: 'var(--ok)', fontSize: 11 }}>Resists: </span>
              {resists.map(([t, m]) => (
                <span key={t} style={{ fontSize: 11, marginRight: 6 }}>
                  <TypeBadge type={t} /> ×{m}
                </span>
              ))}
            </div>
          )}
          {immunes.length > 0 && (
            <div>
              <span style={{ color: 'var(--fg-dim)', fontSize: 11 }}>Immune: </span>
              {immunes.map(([t]) => <TypeBadge key={t} type={t} />)}
            </div>
          )}
        </div>
      </div>

      <div className="section-head" style={{ marginTop: 22 }}>Recommended moveset</div>
      <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 6 }}>
        Auto-picked from learnset using STAB, coverage, and {p.baseStats.atk >= p.baseStats.spa ? 'physical' : 'special'} attacker bias. Hover for reasoning.
      </div>
      <div>
        {suggested.map(({ move, reasons }) => (
          <div key={move.id} className="move-row tooltip">
            <span>{move.name}</span>
            <TypeBadge type={move.type} />
            <span>{move.category[0]}</span>
            <span>{move.power || '-'}</span>
            <span>{move.accuracy === true ? '-' : move.accuracy}</span>
            <span className="desc">{move.desc}</span>
            <span className="tip">{reasons.join(' · ')}</span>
          </div>
        ))}
      </div>

      <div className="section-head">Full learnset ({learnable.length})</div>
      <div style={{ maxHeight: 200, overflow: 'auto', fontSize: 11 }}>
        {learnable.map(({ learn, mv }) => (
          <div key={`${learn}-${mv.id}`} className="move-row">
            <span>{mv.name} <span style={{ color: 'var(--fg-dim)' }}>({learn})</span></span>
            <TypeBadge type={mv.type} />
            <span>{mv.category[0]}</span>
            <span>{mv.power || '-'}</span>
            <span>{mv.accuracy === true ? '-' : mv.accuracy}</span>
            <span className="desc">{mv.desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Renders a "Cobblemon variant" pill when the dex overlay reports a divergence
 * from Showdown for this species. Hover tooltip lists every changed field.
 * No-op when the species matches Showdown exactly.
 */
function CobblemonOverrideBadge({ name }: { name: string }) {
  const merged = getMergedSpecies(name);
  if (!merged?.hasOverride || !merged.divergence) return null;
  const lines = summarizeSpeciesDivergence(merged.divergence);
  if (lines.length === 0) return null;
  return (
    <span
      title={`Cobblemon variant\n\n${lines.join('\n')}`}
      style={{
        marginLeft: 8,
        padding: '2px 6px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        background: 'rgba(255, 196, 0, 0.12)',
        border: '1px solid rgba(255, 196, 0, 0.5)',
        color: '#d9a200',
        cursor: 'help',
      }}
    >
      Cobblemon variant
    </span>
  );
}
