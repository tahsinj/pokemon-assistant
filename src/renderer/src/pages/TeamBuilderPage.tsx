import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Pokemon } from '../lib/types';
import type { LoadedTeamRecord, RivalsTeamTag, SaveTeamPayload } from '../lib/bridgeTypes';
import { TypeBadge } from '../components/TypeBadge';
import { SpeciesList } from '../components/SpeciesList';
import { PokemonSprite } from '../components/PokemonSprite';
import { TYPES, effectiveness } from '../lib/typechart';
import {
  exportShowdownFromParsed,
  exportShowdownTeamSimple,
  parseShowdownTeam,
} from '../lib/showdownTeam';
import { buildSpeciesFuse, resolveSpeciesName } from '../lib/fuzzySpecies';
import { massiveSharedWeaknesses, weaknessCounts } from '../lib/teamWeaknessSummary';

const RIVALS_TAGS: { id: RivalsTeamTag; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'raid', label: 'Raid team' },
  { id: 'gym', label: 'Gym challenger' },
  { id: 'dungeon', label: 'Dungeon sweeper' },
];

export function TeamBuilderPage({ pokemon }: { pokemon: Pokemon[] }) {
  const [team, setTeam] = useState<(Pokemon | null)[]>([null, null, null, null, null, null]);
  const [pickingSlot, setPickingSlot] = useState<number | null>(null);
  const [teamTag, setTeamTag] = useState<RivalsTeamTag>('general');
  const [teamName, setTeamName] = useState('My team');
  const [currentTeamId, setCurrentTeamId] = useState<string | undefined>(undefined);
  const [paste, setPaste] = useState('');
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [savedTeams, setSavedTeams] = useState<{ id: string; name: string; rivenTag: string; updatedAt: number }[]>([]);
  const [lastParsedExport, setLastParsedExport] = useState<string | null>(null);

  const bridge = typeof window !== 'undefined' ? window.cobblemon : undefined;

  const pokemonById = useMemo(() => {
    const m: Record<string, Pokemon> = {};
    for (const p of pokemon) m[p.id] = p;
    return m;
  }, [pokemon]);

  const fuse = useMemo(() => buildSpeciesFuse(pokemon), [pokemon]);

  const refreshSaved = useCallback(async () => {
    if (!bridge?.teamsList) return;
    try {
      const rows = await bridge.teamsList();
      setSavedTeams(rows);
    } catch {
      setSavedTeams([]);
    }
  }, [bridge]);

  useEffect(() => {
    void refreshSaved();
  }, [refreshSaved]);

  const setSlot = (idx: number, p: Pokemon | null) => {
    const next = [...team];
    next[idx] = p;
    setTeam(next);
  };

  const teamMembers = team.filter((x): x is Pokemon => !!x);

  const defensive = useMemo(() => {
    const rows: { type: string; weakCount: number; resistCount: number }[] = [];
    for (const t of TYPES) {
      let weak = 0;
      let resist = 0;
      for (const m of teamMembers) {
        const mult = effectiveness(t, m.types);
        if (mult > 1) weak++;
        else if (mult < 1) resist++;
      }
      rows.push({ type: t, weakCount: weak, resistCount: resist });
    }
    return rows;
  }, [teamMembers]);

  const offensive = useMemo(() => {
    const rows: { type: string; bestMult: number }[] = [];
    for (const t of TYPES) {
      let best = 0;
      for (const m of teamMembers) {
        for (const stab of m.types) {
          const mult = effectiveness(stab, [t]);
          if (mult > best) best = mult;
        }
      }
      rows.push({ type: t, bestMult: best });
    }
    return rows;
  }, [teamMembers]);

  const weakTypes = defensive.filter((d) => d.weakCount >= 2).map((d) => d.type);
  const suggestions = useMemo(() => {
    if (!weakTypes.length) return [];
    return pokemon
      .map((p) => {
        const score = weakTypes.reduce((acc, wt) => {
          const m = effectiveness(wt, p.types);
          return acc + (m === 0 ? 3 : m < 1 ? 2 : 0);
        }, 0);
        return { p, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }, [weakTypes.join(','), pokemon]);

  const notableWeak = useMemo(() => weaknessCounts(teamMembers).filter((r) => r.weakCount >= 2), [teamMembers]);
  const massiveWeak = useMemo(() => massiveSharedWeaknesses(teamMembers, 3), [teamMembers]);

  const onImportPaste = () => {
    setImportMsg(null);
    const parsed = parseShowdownTeam(paste);
    if (!parsed.length) {
      setImportMsg('No Pokémon blocks found. Paste a Showdown export (blank line between species).');
      return;
    }
    const next: (Pokemon | null)[] = [null, null, null, null, null, null];
    const misses: string[] = [];
    parsed.forEach((block, i) => {
      if (i >= 6) return;
      const hit = resolveSpeciesName(fuse, block.species);
      if (hit) next[i] = hit;
      else misses.push(block.species);
    });
    setTeam(next);
    setLastParsedExport(exportShowdownFromParsed(parsed));
    if (misses.length) {
      setImportMsg(`Loaded ${parsed.length - misses.length}/${parsed.length}. Unmatched: ${misses.join(', ')}`);
    } else {
      setImportMsg(`Imported ${parsed.length} Pokémon.`);
    }
  };

  const onExportCopy = async () => {
    const text =
      lastParsedExport && teamMembers.length
        ? lastParsedExport
        : exportShowdownTeamSimple(team.map((p) => p?.name));
    try {
      await navigator.clipboard.writeText(text);
      setImportMsg('Copied Showdown text to clipboard.');
    } catch {
      setImportMsg('Could not copy - select and copy manually from export box.');
    }
  };

  const buildSavePayload = (): SaveTeamPayload => {
    const showdownExport = paste.trim() || exportShowdownTeamSimple(team.map((p) => p?.name)) || null;
    const members = team.map((p, slot) => ({
      slot,
      speciesId: p?.id ?? null,
      speciesDisplay: p?.name ?? '',
      item: null,
      ability: null,
      nature: null,
      evs: null,
      moves: null,
    }));
    return {
      id: currentTeamId,
      name: teamName.trim() || 'Untitled',
      rivenTag: teamTag,
      showdownExport,
      members,
    };
  };

  const onSave = async () => {
    if (!bridge?.teamsSave) {
      setImportMsg('Saving requires the desktop app (Electron).');
      return;
    }
    try {
      const { id } = await bridge.teamsSave(buildSavePayload());
      setCurrentTeamId(id);
      setImportMsg('Team saved.');
      await refreshSaved();
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : 'Save failed.');
    }
  };

  const onLoad = async (id: string) => {
    if (!bridge?.teamsLoad) return;
    const rec = (await bridge.teamsLoad(id)) as LoadedTeamRecord | null;
    if (!rec) return;
    setCurrentTeamId(rec.id);
    setTeamName(rec.name);
    setTeamTag((RIVALS_TAGS.some((t) => t.id === rec.rivenTag) ? rec.rivenTag : 'general') as RivalsTeamTag);
    setPaste(rec.showdownExport || '');
    const next: (Pokemon | null)[] = [null, null, null, null, null, null];
    for (const m of rec.members) {
      if (m.slot < 0 || m.slot > 5) continue;
      next[m.slot] = m.speciesId ? pokemonById[m.speciesId] ?? null : null;
    }
    setTeam(next);
    setImportMsg(`Loaded “${rec.name}”.`);
  };

  const onDelete = async (id: string) => {
    if (!bridge?.teamsDelete) return;
    await bridge.teamsDelete(id);
    if (currentTeamId === id) {
      setCurrentTeamId(undefined);
      setTeam([null, null, null, null, null, null]);
    }
    await refreshSaved();
  };

  return (
    <div>
      <h1 className="page-title">Team Builder</h1>
      <p className="page-sub">
        Showdown-style import/export, defensive/offensive coverage, shared-weakness alerts, and saved teams (SQLite via
        Electron).
      </p>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="section-head">Rivals preset</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 12 }}>
          <label>
            Team name{' '}
            <input value={teamName} onChange={(e) => setTeamName(e.target.value)} style={{ minWidth: 180 }} />
          </label>
          <label>
            Tag{' '}
            <select value={teamTag} onChange={(e) => setTeamTag(e.target.value as RivalsTeamTag)}>
              {RIVALS_TAGS.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </label>
          <button type="button" className="btn btn-primary" onClick={() => void onSave()}>Save team</button>
        </div>
        {savedTeams.length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 6 }}>Saved locally</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
              {savedTeams.map((t) => (
                <li key={t.id} style={{ marginBottom: 6 }}>
                  <button type="button" onClick={() => void onLoad(t.id)} style={{ marginRight: 8 }}>
                    Load
                  </button>
                  <button type="button" onClick={() => void onDelete(t.id)} style={{ marginRight: 8 }}>
                    Delete
                  </button>
                  <span>{t.name}</span>
                  <span className="pill" style={{ marginLeft: 6 }}>{t.rivenTag}</span>
                  <span style={{ color: 'var(--fg-dim)', fontSize: 11, marginLeft: 6 }}>
                    {new Date(t.updatedAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="section-head">Pokémon Showdown paste</div>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder={'Paste a Showdown export…\n\nGarchomp @ Leftovers\nAbility: Rough Skin\nEVs: 252 Atk / 4 SpD / 252 Spe\nJolly Nature\n- Earthquake'}
          rows={10}
          style={{ width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 12, marginBottom: 8 }}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={onImportPaste}>Import into slots</button>
          <button type="button" onClick={() => void onExportCopy()}>Copy export</button>
        </div>
        {importMsg && (
          <p style={{ marginTop: 10, fontSize: 13, color: 'var(--fg-dim)' }} role="status">{importMsg}</p>
        )}
      </div>

      {massiveWeak.length > 0 && (
        <div
          className="panel"
          style={{ marginBottom: 16, borderColor: 'var(--danger)', background: 'rgba(239,68,68,0.06)' }}
          role="status"
        >
          <div className="section-head" style={{ color: 'var(--danger)' }}>Heavy shared weaknesses</div>
          <p style={{ fontSize: 13, marginTop: 0 }}>
            {massiveWeak.map((w) => (
              <span key={w.attackType} style={{ marginRight: 12 }}>
                <TypeBadge type={w.attackType} /> hits <strong>{w.weakCount}</strong> of {teamMembers.length} super-effectively
              </span>
            ))}
          </p>
        </div>
      )}

      {notableWeak.length > 0 && teamMembers.length > 0 && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="section-head">Shared weaknesses (2+ Pokémon)</div>
          <p style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 0 }}>
            Attacking types where multiple teammates are weak (Showdown-style defensive read).
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {notableWeak.slice(0, 12).map((w) => (
              <span key={w.attackType} className="pill">
                <TypeBadge type={w.attackType} /> ×{w.weakCount}
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 16 }}>
        {team.map((p, i) => (
          <div
            key={i}
            className={`team-slot ${!p ? 'empty' : ''}`}
            onClick={() => setPickingSlot(i)}
            style={pickingSlot === i ? { borderColor: 'var(--accent)' } : undefined}
          >
            {p ? (
              <>
                <PokemonSprite dex={p.dex} name={p.name} size="sm" />
                <strong>{p.name}</strong>
                <div>{p.types.map((t) => <TypeBadge key={t} type={t} />)}</div>
                <button
                  type="button"
                  style={{ position: 'absolute', top: 4, right: 4, padding: '2px 6px', fontSize: 10 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSlot(i, null);
                  }}
                  aria-label={`Remove ${p.name} from slot ${i + 1}`}
                >×</button>
              </>
            ) : (
              <span>+ slot {i + 1}</span>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="panel">
          <div className="section-head">Defensive profile (rows = attacker type)</div>
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 8 }}>
            Red bar length = how many team members are weak. Green = resist.
          </div>
          {defensive.map((d) => (
            <div key={d.type} className="stat-row tooltip">
              <span style={{ width: 64 }}><TypeBadge type={d.type} /></span>
              <div className="stat-bar" style={{ background: '#111' }}>
                <div
                  className="fill"
                  style={{
                    width: `${(d.weakCount / Math.max(teamMembers.length, 1)) * 100}%`,
                    background: d.weakCount >= 2 ? 'var(--danger)' : 'var(--warn)',
                  }}
                />
              </div>
              <span className="value" style={{ color: d.weakCount >= 2 ? 'var(--danger)' : 'var(--fg-dim)' }}>
                {d.weakCount}w / {d.resistCount}r
              </span>
              <span className="tip">
                {d.weakCount} team members take super-effective damage from {d.type}. {d.resistCount} resist it.
              </span>
            </div>
          ))}
        </div>

        <div className="panel">
          <div className="section-head">Offensive coverage (best STAB vs defender type)</div>
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 8 }}>
            Gaps = no team member has a STAB type super-effective against that defender.
          </div>
          {teamMembers.length === 0 ? (
            <div className="species-empty" style={{ padding: '24px 12px' }}>
              Add Pokémon to your team to see STAB coverage per defending type.
            </div>
          ) : (
            offensive.map((o) => (
              <div key={o.type} className="stat-row">
                <span style={{ width: 64 }}><TypeBadge type={o.type} /></span>
                <div className="stat-bar">
                  <div
                    className="fill"
                    style={{
                      width: `${Math.min(100, (o.bestMult / 2) * 100)}%`,
                      background: o.bestMult >= 2 ? 'var(--ok)' : o.bestMult === 1 ? 'var(--fg-dim)' : 'var(--danger)',
                    }}
                  />
                </div>
                <span className="value">×{o.bestMult}</span>
              </div>
            ))
          )}

          {suggestions.length > 0 && (
            <>
              <div className="section-head">Suggested additions</div>
              <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 6 }}>
                Picks that resist your most-shared weaknesses: {weakTypes.join(', ')}
              </div>
              {suggestions.map(({ p, score }) => (
                <div key={p.id} className="badge-counter">
                  <span>{p.name} {p.types.map((t) => <TypeBadge key={t} type={t} />)}</span>
                  <span className="score">+{score}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {pickingSlot !== null && (
        <div className="panel" style={{ marginTop: 16, height: 420 }}>
          <div className="section-head">Pick species for slot {pickingSlot + 1}</div>
          <SpeciesList
            pokemon={pokemon}
            onSelect={(p) => {
              setSlot(pickingSlot, p);
              setPickingSlot(null);
            }}
          />
        </div>
      )}
    </div>
  );
}
