import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Pokemon } from '../lib/types';
import type { LoadedTeamRecord, RivalsTeamTag, SaveTeamPayload } from '../lib/bridgeTypes';
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
import { suggestTeammates } from '../lib/teamSynergy';
import type { SmogonBundle } from '../lib/smogon';
import { usePcCollection } from '../lib/usePcCollection';
import { ModuleFrame } from '../components/hud/ModuleFrame';
import { TypeChip } from '../components/hud/HudPrimitives';
import { bst } from '../lib/stats';

const RIVALS_TAGS: { id: RivalsTeamTag; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'raid', label: 'Raid team' },
  { id: 'gym', label: 'Gym challenger' },
  { id: 'dungeon', label: 'Dungeon sweeper' },
];

export function TeamBuilderPage({
  pokemon,
  smogon,
}: { pokemon: Pokemon[]; smogon: SmogonBundle | null }) {
  const [team, setTeam] = useState<(Pokemon | null)[]>([null, null, null, null, null, null]);
  const [pickingSlot, setPickingSlot] = useState<number | null>(null);
  const [pickSource, setPickSource] = useState<'species' | 'pc'>('species');
  const pc = usePcCollection();
  const [teamTag, setTeamTag] = useState<RivalsTeamTag>('general');
  const [teamName, setTeamName] = useState('My team');
  const [currentTeamId, setCurrentTeamId] = useState<string | undefined>(undefined);
  const [paste, setPaste] = useState('');
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
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

  const coverageCount = offensive.filter((o) => o.bestMult >= 2).length;
  const weakTypes = defensive.filter((d) => d.weakCount >= 2).map((d) => d.type);
  const suggestions = useMemo(() => {
    if (teamMembers.length === 0 || teamMembers.length >= 6) return [];
    return suggestTeammates(teamMembers, pokemon, smogon, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamMembers.map((m) => m.id).join(','), pokemon, smogon]);

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

  const sectionHead = (label: string, extra?: string) => (
    <div className="font-mono-hud text-[14px] uppercase tracking-widest text-[var(--hud-accent-2)] mb-2">
      ◢ {label}
      {extra && <span className="text-[var(--ink-2)]"> · {extra}</span>}
    </div>
  );

  return (
    <ModuleFrame
      kicker="◢ TEAM BUILDER"
      title="Squad Six"
      subtitle={`Shared weakness · ${notableWeak.length} · type coverage ${coverageCount}/18`}
      side={
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="chunky ghost font-display text-[12px]"
            style={{ padding: '6px 12px' }}
            onClick={() => setImportOpen((v) => !v)}
            aria-expanded={importOpen}
          >
            IMPORT
          </button>
          <button
            type="button"
            className="chunky font-display text-[12px]"
            style={{ padding: '6px 12px' }}
            onClick={() => void onSave()}
          >
            SAVE TEAM
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Import / save drawer */}
        {importOpen && (
          <div className="mono-panel p-3 rounded-[10px]">
            {sectionHead('SHOWDOWN PASTE / TEAM META')}
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <label className="flex items-center gap-1.5 font-mono-hud text-[13px] uppercase tracking-wider text-[var(--ink-2)]">
                Name
                <input
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className="bg-black/40 border border-white/15 rounded-full px-3 py-1 font-mono-hud text-[14px] text-white outline-none focus:border-[var(--hud-accent-2)] min-w-[180px]"
                />
              </label>
              <label className="flex items-center gap-1.5 font-mono-hud text-[13px] uppercase tracking-wider text-[var(--ink-2)]">
                Tag
                <select
                  value={teamTag}
                  onChange={(e) => setTeamTag(e.target.value as RivalsTeamTag)}
                  className="bg-black/40 border border-white/15 rounded-full px-2.5 py-1 font-mono-hud text-[13px] uppercase tracking-wider text-[var(--ink-1)] outline-none focus:border-[var(--hud-accent-2)]"
                >
                  {RIVALS_TAGS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder={'Paste a Showdown export…\n\nGarchomp @ Leftovers\nAbility: Rough Skin\nEVs: 252 Atk / 4 SpD / 252 Spe\nJolly Nature\n- Earthquake'}
              rows={8}
              className="w-full bg-black/40 border border-white/15 rounded-[10px] px-3 py-2 font-mono-hud text-[14px] text-[var(--ink-0)] placeholder:text-[var(--ink-2)] outline-none focus:border-[var(--hud-accent-2)] mb-2"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="chunky font-display text-[12px]"
                style={{ '--c': 'var(--hud-accent-2)', padding: '6px 12px' } as React.CSSProperties}
                onClick={onImportPaste}
              >
                IMPORT INTO SLOTS
              </button>
              <button
                type="button"
                className="chunky ghost font-display text-[12px]"
                style={{ padding: '6px 12px' }}
                onClick={() => void onExportCopy()}
              >
                COPY EXPORT
              </button>
            </div>
            {savedTeams.length > 0 && (
              <div className="mt-3">
                <div className="font-mono-hud text-[13px] uppercase tracking-wider text-[var(--ink-2)] mb-1.5">
                  Saved locally
                </div>
                <div className="flex flex-col gap-1.5">
                  {savedTeams.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-[8px] border border-white/5 bg-white/[.03]"
                    >
                      <span className="font-display text-[14px] font-semibold flex-1 min-w-0 truncate text-[var(--ink-0)]">
                        {t.name}
                      </span>
                      <span className="font-mono-hud text-[12px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-black/40 text-[var(--hud-accent-2)]">
                        {t.rivenTag}
                      </span>
                      <span className="font-mono-hud text-[12px] text-[var(--ink-2)]">
                        {new Date(t.updatedAt).toLocaleString()}
                      </span>
                      <button
                        type="button"
                        className="chunky ghost font-display text-[11px]"
                        style={{ padding: '3px 8px' }}
                        onClick={() => void onLoad(t.id)}
                      >
                        LOAD
                      </button>
                      <button
                        type="button"
                        className="chunky ghost font-display text-[11px]"
                        style={{ '--c': 'var(--hud-danger)', padding: '3px 8px' } as React.CSSProperties}
                        onClick={() => void onDelete(t.id)}
                      >
                        DEL
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {importMsg && (
          <div role="status" className="font-mono-hud text-[14px] text-[var(--ink-1)] px-1">
            › {importMsg}
          </div>
        )}

        {/* Heavy shared weakness alert */}
        {massiveWeak.length > 0 && (
          <div
            role="status"
            className="px-3 py-2 rounded-[10px] flex flex-wrap items-center gap-3 font-mono-hud text-[14px]"
            style={{
              color: 'var(--hud-danger)',
              background: 'rgba(255,91,108,.10)',
              border: '1px solid rgba(255,91,108,.4)',
            }}
          >
            <span className="uppercase tracking-widest">⚠ Heavy shared weakness</span>
            {massiveWeak.map((w) => (
              <span key={w.attackType} className="inline-flex items-center gap-1 text-[var(--ink-0)]">
                <TypeChip t={w.attackType.toLowerCase()} /> hits {w.weakCount}/{teamMembers.length}
              </span>
            ))}
          </div>
        )}

        {/* Squad cards - design TeamModule grid */}
        <div className="grid grid-cols-3 gap-3">
          {team.map((p, i) => {
            if (!p) {
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPickingSlot(i)}
                  className={`rounded-[14px] border border-dashed p-3 min-h-[88px] flex items-center justify-center font-mono-hud text-[14px] uppercase tracking-widest transition ${
                    pickingSlot === i
                      ? 'border-[var(--hud-accent)] text-[var(--hud-accent)]'
                      : 'border-white/15 text-[var(--ink-2)] hover:border-white/30 hover:text-[var(--ink-1)]'
                  }`}
                >
                  + Slot {i + 1}
                </button>
              );
            }
            const t1 = p.types[0].toLowerCase();
            const t2 = (p.types[1] || p.types[0]).toLowerCase();
            return (
              <div
                key={i}
                onClick={() => setPickingSlot(i)}
                className={`relative overflow-hidden rounded-[14px] border bg-white/[.04] hover:bg-white/[.07] transition group cursor-pointer ${
                  pickingSlot === i ? 'border-[var(--hud-accent)]' : 'border-white/10'
                }`}
              >
                <div
                  className="absolute inset-0 opacity-[.10] group-hover:opacity-[.18] transition"
                  style={{ background: `var(--t-${t1})` }}
                />
                <div className="relative p-3 flex items-center gap-3">
                  <div className="relative w-[52px] h-[60px] flex-shrink-0">
                    <div
                      className="absolute inset-0 hex"
                      style={{
                        background: `linear-gradient(160deg, var(--t-${t1}), var(--t-${t2}))`,
                      }}
                    />
                    <div className="absolute inset-[2px] hex" style={{ background: 'rgba(8,18,26,.9)' }} />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <PokemonSprite dex={p.dex} name={p.name} size="sm" />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-[15px] font-bold flex items-center justify-between text-[var(--ink-0)]">
                      <span className="truncate">{p.name}</span>
                      <span className="font-mono-hud text-[12px] text-[var(--ink-2)] flex-shrink-0 ml-2">
                        #{String(p.dex).padStart(4, '0')}
                      </span>
                    </div>
                    <div className="font-mono-hud text-[13px] text-[var(--ink-2)] uppercase">
                      BST {bst(p.baseStats)}
                    </div>
                    <div className="flex gap-1 mt-1">
                      {p.types.map((t) => (
                        <TypeChip key={t} t={t.toLowerCase()} />
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${p.name} from slot ${i + 1}`}
                    className="absolute top-2 right-2 w-5 h-5 rounded-full bg-black/50 border border-white/15 text-[var(--ink-1)] hover:text-white hover:border-white/40 font-mono-hud text-[12px] leading-none opacity-0 group-hover:opacity-100 transition"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSlot(i, null);
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Slot picker */}
        {pickingSlot !== null && (
          <div className="mono-panel p-3 rounded-[10px]">
            <div className="flex items-center justify-between gap-3">
              {sectionHead(`PICK SPECIES FOR SLOT ${pickingSlot + 1}`)}
              {pc.available && (
                <div className="flex items-center gap-1 mono-panel rounded-full p-0.5 mb-2">
                  {(['species', 'pc'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setPickSource(s)}
                      className={`font-mono-hud text-[12px] uppercase tracking-wider px-3 py-1 rounded-full transition-colors ${
                        pickSource === s
                          ? 'bg-[var(--hud-accent-2)] text-black'
                          : 'text-[var(--ink-2)] hover:text-[var(--ink-1)]'
                      }`}
                    >
                      {s === 'species' ? 'All species' : `PC box · ${pc.mons.length}`}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="h-[320px]">
              {pickSource === 'pc' && pc.available ? (
                pc.mons.length === 0 ? (
                  <div className="font-mono-hud text-[14px] text-[var(--ink-2)] py-6 text-center">
                    {pc.loading ? 'Loading PC…' : 'No Pokémon stored in the PC yet.'}
                  </div>
                ) : (
                  <div className="h-full overflow-y-auto pr-1 no-scrollbar flex flex-col gap-1">
                    {pc.mons.map((rec) => {
                      const sp = pokemonById[rec.speciesId];
                      if (!sp) return null;
                      return (
                        <button
                          key={rec.id}
                          type="button"
                          onClick={() => {
                            setSlot(pickingSlot, sp);
                            setPickingSlot(null);
                          }}
                          className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-[10px] border border-white/10 bg-white/[.04] text-left hover:border-[var(--hud-accent-2)] transition"
                        >
                          <PokemonSprite dex={sp.dex} name={sp.name} size="xs" />
                          <span className="font-display text-[14px] font-semibold flex-1 min-w-0 truncate text-[var(--ink-0)]">
                            {rec.nickname || sp.name}
                            {rec.nickname && (
                              <span className="font-mono-hud text-[11px] text-[var(--ink-2)] ml-1.5">{sp.name}</span>
                            )}
                          </span>
                          <span className="font-mono-hud text-[12px] text-[var(--ink-1)] flex-shrink-0">
                            Lv {rec.level}
                          </span>
                          <span className="font-mono-hud text-[11px] uppercase tracking-wider text-[var(--ink-2)] flex-shrink-0">
                            {pc.boxNameById[rec.boxId] ?? 'Box'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )
              ) : (
                <SpeciesList
                  pokemon={pokemon}
                  onSelect={(p) => {
                    setSlot(pickingSlot, p);
                    setPickingSlot(null);
                  }}
                />
              )}
            </div>
          </div>
        )}

        {/* Coverage rows - design coverage grid, real numbers */}
        <div className="grid grid-cols-2 gap-4">
          <div className="mono-panel p-3 rounded-[10px]">
            {sectionHead('DEFENSIVE COVERAGE', 'resists − weaknesses per attacking type')}
            <div className="grid grid-cols-9 gap-1.5">
              {defensive.map((d) => {
                const score = d.resistCount - d.weakCount;
                const c = score > 0 ? '#7cd87b' : score < 0 ? 'var(--hud-danger)' : 'var(--ink-1)';
                return (
                  <div
                    key={d.type}
                    className="flex flex-col items-center gap-1"
                    title={`${d.weakCount} weak · ${d.resistCount} resist vs ${d.type}`}
                  >
                    <TypeChip t={d.type.toLowerCase()} fill />
                    <div className="font-mono-hud text-[13px]" style={{ color: c }}>
                      {score > 0 ? `+${score}` : score}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mono-panel p-3 rounded-[10px]">
            {sectionHead('OFFENSIVE COVERAGE', 'best STAB vs defender')}
            {teamMembers.length === 0 ? (
              <div className="font-mono-hud text-[14px] text-[var(--ink-2)] py-4 text-center">
                Add Pokémon to see STAB coverage.
              </div>
            ) : (
              <div className="grid grid-cols-9 gap-1.5">
                {offensive.map((o) => {
                  const c =
                    o.bestMult >= 2 ? '#7cd87b' : o.bestMult >= 1 ? 'var(--ink-1)' : 'var(--hud-danger)';
                  return (
                    <div
                      key={o.type}
                      className="flex flex-col items-center gap-1"
                      title={`Best STAB multiplier vs ${o.type}: ×${o.bestMult}`}
                    >
                      <TypeChip t={o.type.toLowerCase()} fill />
                      <div className="font-mono-hud text-[13px]" style={{ color: c }}>
                        ×{o.bestMult}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Suggested teammates - Smogon co-usage + coverage analysis */}
        {suggestions.length > 0 && (
          <div className="mono-panel p-3 rounded-[10px]">
            {sectionHead(
              'SUGGESTED TEAMMATES',
              smogon
                ? `${smogon.meta.label} ${smogon.meta.month} co-usage + coverage${weakTypes.length ? ` · stacked weak: ${weakTypes.join(', ')}` : ''}`
                : 'type-coverage analysis',
            )}
            <div className="grid grid-cols-3 gap-2">
              {suggestions.map(({ p, reasons }) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    const empty = team.findIndex((s) => s === null);
                    if (empty >= 0) setSlot(empty, p);
                  }}
                  title="Click to add to the first empty slot"
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-[10px] border border-white/10 bg-white/[.04] text-left hover:border-[var(--hud-accent-2)] transition"
                >
                  <PokemonSprite dex={p.dex} name={p.name} size="xs" />
                  <span className="flex-1 min-w-0">
                    <span className="block font-display text-[14px] font-semibold truncate text-[var(--ink-0)]">
                      {p.name}
                    </span>
                    <span className="block font-mono-hud text-[11px] text-[var(--ink-2)] truncate">
                      {reasons[0] ?? ''}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </ModuleFrame>
  );
}
