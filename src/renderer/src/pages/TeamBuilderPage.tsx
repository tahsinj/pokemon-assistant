import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Move, Pokemon, HeldItem } from '../lib/types';
import { buildBestTeams, type BestSixResult, type MemberAdvice, type TeamCandidate } from '../lib/bestSix';
import type { LoadedTeamRecord, MemberDetail, RivalsTeamTag, SaveTeamPayload } from '../lib/bridgeTypes';
import { setTeamDraft } from '../lib/teamDraft';
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
import { isSuggestableTeammate } from '../lib/legality';
import { buildGatedItemIds, gatedItemsByKind, makeItemFilter, normItemId } from '../lib/itemKinds';
import { loadOwnedItems, toggleOwnedItem } from '../lib/ownedItems';
import { TeamCompositionPanel } from '../components/team/TeamCompositionPanel';

const RIVALS_TAGS: { id: RivalsTeamTag; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'raid', label: 'Raid team' },
  { id: 'gym', label: 'Gym challenger' },
  { id: 'dungeon', label: 'Dungeon sweeper' },
];

const STAT_SHORT = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'] as const;
const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;

function evShort(evs: Partial<Record<(typeof STAT_KEYS)[number], number>>): string {
  return STAT_KEYS.map((k, i) => (evs[k] ? `${evs[k]} ${STAT_SHORT[i]}` : null))
    .filter(Boolean)
    .join(' / ');
}

/** Flatten a member's optimization advice into display rows. */
function adviceLines(a: MemberAdvice): { text: string; danger?: boolean }[] {
  const out: { text: string; danger?: boolean }[] = [];
  if (a.natureChange) out.push({ text: `NATURE ${a.natureChange.from} → ${a.natureChange.to}` });
  if (a.evTarget) out.push({ text: `EVs → ${evShort(a.evTarget.target) || 'flat'}` });
  if (a.itemSuggestion) {
    out.push({ text: `ITEM ${a.itemSuggestion.current ?? 'none'} → ${a.itemSuggestion.suggested}` });
  }
  for (const ch of a.moveChanges) {
    out.push({ text: `TEACH ${ch.teach}${ch.replace ? ` (replace ${ch.replace})` : ''}` });
  }
  for (const iv of a.ivChanges) {
    out.push({ text: `IV ${iv.stat.toUpperCase()} ${iv.from} → ${iv.to} (${iv.reason})` });
  }
  if (a.needsLeveling) {
    out.push({ text: `⚠ LV ${a.needsLeveling.current} → train toward ${a.needsLeveling.target}`, danger: true });
  }
  return out;
}

/** A filled squad slot: the species plus whatever set details we know. */
export interface TeamSlot {
  p: Pokemon;
  detail: MemberDetail | null;
}

const EMPTY_TEAM: (TeamSlot | null)[] = [null, null, null, null, null, null];

export function TeamBuilderPage({
  pokemon,
  moves,
  items,
  smogon,
}: { pokemon: Pokemon[]; moves: Record<string, Move>; items: HeldItem[]; smogon: SmogonBundle | null }) {
  const [team, setTeam] = useState<(TeamSlot | null)[]>(EMPTY_TEAM);
  const [pickingSlot, setPickingSlot] = useState<number | null>(null);
  const [pickSource, setPickSource] = useState<'species' | 'pc' | 'suggested'>('species');
  const [pcQuery, setPcQuery] = useState('');
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

  const intelBy = useCallback((id: string) => smogon?.species[id] ?? null, [smogon]);
  const pcMons = useMemo(
    () => pc.mons.map((r) => pokemonById[r.speciesId]).filter((p): p is Pokemon => !!p),
    [pc.mons, pokemonById],
  );

  // Mega Stones / Z-Crystals are only suggested when the player marks them owned.
  const gatedItemIds = useMemo(() => buildGatedItemIds(items), [items]);
  const gatedItems = useMemo(() => gatedItemsByKind(items), [items]);
  const [ownedItems, setOwnedItems] = useState<Set<string>>(() => loadOwnedItems());
  const [ownedOpen, setOwnedOpen] = useState(false);
  const [ownedQuery, setOwnedQuery] = useState('');
  const allowItem = useMemo(
    () => makeItemFilter(gatedItemIds, ownedItems),
    [gatedItemIds, ownedItems],
  );

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

  const setSlot = (idx: number, p: Pokemon | null, detail: MemberDetail | null = null) => {
    const next = [...team];
    next[idx] = p ? { p, detail } : null;
    setTeam(next);
  };

  const teamMembers = team.filter((x): x is TeamSlot => !!x).map((s) => s.p);

  // Mirror the squad for other pages (damage calc / battle session imports).
  useEffect(() => {
    setTeamDraft(team.map((s) => (s ? { speciesId: s.p.id, detail: s.detail } : null)));
  }, [team]);

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
  // Recommend only "normal" NatDex OU mons - no legendaries / paradox / Ubers.
  const suggestablePool = useMemo(() => pokemon.filter(isSuggestableTeammate), [pokemon]);
  const suggestions = useMemo(() => {
    if (teamMembers.length === 0 || teamMembers.length >= 6) return [];
    return suggestTeammates(teamMembers, suggestablePool, smogon, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamMembers.map((m) => m.id).join(','), suggestablePool, smogon]);

  const notableWeak = useMemo(() => weaknessCounts(teamMembers).filter((r) => r.weakCount >= 2), [teamMembers]);
  const massiveWeak = useMemo(() => massiveSharedWeaknesses(teamMembers, 3), [teamMembers]);

  // PC box mons filtered by the picker search (name or nickname).
  const pcMonsFiltered = useMemo(() => {
    const q = pcQuery.trim().toLowerCase();
    if (!q) return pc.mons;
    return pc.mons.filter((rec) => {
      const sp = pokemonById[rec.speciesId];
      return (
        (sp?.name.toLowerCase().includes(q) ?? false) ||
        (rec.nickname?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [pc.mons, pcQuery, pokemonById]);

  // Unique species you own, for the "Suggested" (owned-only) picker tab.
  const ownedSpecies = useMemo(() => {
    const seen = new Set<string>();
    const out: Pokemon[] = [];
    for (const p of pcMons) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        out.push(p);
      }
    }
    return out;
  }, [pcMons]);

  // Synergy-ranked teammates restricted to mons you actually own. With no team
  // yet there's no context to rank against, so just list owned species.
  const pickerSuggestions = useMemo(() => {
    const onTeam = new Set(teamMembers.map((m) => m.id));
    const pool = ownedSpecies.filter((p) => !onTeam.has(p.id));
    if (teamMembers.length === 0) return pool.map((p) => ({ p, reasons: ['In your PC'] }));
    return suggestTeammates(teamMembers, pool, smogon, 24);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownedSpecies, teamMembers.map((m) => m.id).join(','), smogon]);

  // Add a species you own to the picking slot, carrying its stored PC set.
  const pickOwnedSpecies = (sp: Pokemon) => {
    if (pickingSlot === null) return;
    const rec = pc.mons.find((r) => r.speciesId === sp.id);
    setSlot(
      pickingSlot,
      sp,
      rec
        ? {
            item: rec.item,
            ability: rec.ability || null,
            nature: rec.nature || null,
            level: rec.level,
            ivs: { ...rec.ivs },
            evs: { ...rec.evs },
            moves: rec.moves.length ? rec.moves : null,
          }
        : null,
    );
    setPickingSlot(null);
  };

  const onImportPaste = () => {
    setImportMsg(null);
    const parsed = parseShowdownTeam(paste);
    if (!parsed.length) {
      setImportMsg('No Pokémon blocks found. Paste a Showdown export (blank line between species).');
      return;
    }
    const next: (TeamSlot | null)[] = [null, null, null, null, null, null];
    const misses: string[] = [];
    parsed.forEach((block, i) => {
      if (i >= 6) return;
      const hit = resolveSpeciesName(fuse, block.species);
      if (hit) {
        next[i] = {
          p: hit,
          detail: {
            item: block.item ?? null,
            ability: block.ability ?? null,
            nature: block.nature ?? null,
            level: block.level ?? null,
            ivs: block.ivs && Object.keys(block.ivs).length ? block.ivs : null,
            evs: block.evs && Object.keys(block.evs).length ? block.evs : null,
            moves: block.moves.length ? block.moves : null,
          },
        };
      } else misses.push(block.species);
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
        : exportShowdownTeamSimple(team.map((s) => s?.p.name));
    try {
      await navigator.clipboard.writeText(text);
      setImportMsg('Copied Showdown text to clipboard.');
    } catch {
      setImportMsg('Could not copy - select and copy manually from export box.');
    }
  };

  const buildSavePayload = (): SaveTeamPayload => {
    const showdownExport = paste.trim() || exportShowdownTeamSimple(team.map((s) => s?.p.name)) || null;
    const members = team.map((s, slot) => ({
      slot,
      speciesId: s?.p.id ?? null,
      speciesDisplay: s?.p.name ?? '',
      item: s?.detail?.item ?? null,
      ability: s?.detail?.ability ?? null,
      nature: s?.detail?.nature ?? null,
      level: s?.detail?.level ?? null,
      ivs: s?.detail?.ivs ?? null,
      evs: s?.detail?.evs ?? null,
      moves: s?.detail?.moves ?? null,
    }));
    return {
      id: currentTeamId,
      name: teamName.trim() || 'Untitled',
      rivenTag: teamTag,
      showdownExport,
      members,
    };
  };

  // Refresh each filled slot's set (item/moves/EVs/IVs/nature/level) from the
  // matching PC mon, so a team built before a change picks up the real data.
  // Matches by species (first PC mon of that species). Slots not in the PC are
  // left as-is. The user saves afterwards to persist.
  const onSyncFromPc = () => {
    if (!pc.available) {
      setImportMsg('PC storage is not available.');
      return;
    }
    let synced = 0;
    const missing: string[] = [];
    const next = team.map((s) => {
      if (!s) return s;
      const rec = pc.mons.find((r) => r.speciesId === s.p.id);
      if (!rec) {
        missing.push(s.p.name);
        return s;
      }
      synced++;
      return {
        p: s.p,
        detail: {
          item: rec.item,
          ability: rec.ability || null,
          nature: rec.nature || null,
          level: rec.level,
          ivs: { ...rec.ivs },
          evs: { ...rec.evs },
          moves: rec.moves.length ? rec.moves : null,
        },
      };
    });
    setTeam(next);
    setImportMsg(
      `Synced ${synced} from PC${missing.length ? ` · not in PC: ${missing.join(', ')}` : ''}. Save to persist.`,
    );
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
    const next: (TeamSlot | null)[] = [null, null, null, null, null, null];
    for (const m of rec.members) {
      if (m.slot < 0 || m.slot > 5) continue;
      const sp = m.speciesId ? pokemonById[m.speciesId] ?? null : null;
      const hasDetail = m.item || m.ability || m.nature || m.level != null || m.ivs || m.evs || m.moves?.length;
      next[m.slot] = sp
        ? {
            p: sp,
            detail: hasDetail
              ? { item: m.item, ability: m.ability, nature: m.nature, level: m.level, ivs: m.ivs, evs: m.evs, moves: m.moves }
              : null,
          }
        : null;
    }
    setTeam(next);
    setImportMsg(`Loaded “${rec.name}”.`);
  };

  const onDelete = async (id: string) => {
    if (!bridge?.teamsDelete) return;
    await bridge.teamsDelete(id);
    if (currentTeamId === id) {
      setCurrentTeamId(undefined);
      setTeam(EMPTY_TEAM);
    }
    await refreshSaved();
  };

  const onNew = () => {
    setTeam(EMPTY_TEAM);
    setCurrentTeamId(undefined);
    setTeamName('My team');
    setPaste('');
    setLastParsedExport(null);
    setImportMsg('Started a new team.');
  };

  const onSaveAs = async () => {
    if (!bridge?.teamsSave) {
      setImportMsg('Saving requires the desktop app (Electron).');
      return;
    }
    try {
      // Force an insert regardless of the loaded team.
      const { id } = await bridge.teamsSave({ ...buildSavePayload(), id: undefined });
      setCurrentTeamId(id);
      setImportMsg(`Saved a copy as “${teamName.trim() || 'Untitled'}”.`);
      await refreshSaved();
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : 'Save failed.');
    }
  };

  const [renamingTeamId, setRenamingTeamId] = useState<string | null>(null);
  const [teamRenameDraft, setTeamRenameDraft] = useState('');

  // Best-6 builder over the PC collection.
  const [bestSix, setBestSix] = useState<BestSixResult | null>(null);
  const [expandedAdvice, setExpandedAdvice] = useState<string | null>(null);
  const [legalOnly, setLegalOnly] = useState(true);

  const onAnalyzePc = () => {
    setBestSix(buildBestTeams(pc.mons, pokemonById, moves, smogon, { legalOnly, allowItem }));
    setExpandedAdvice(null);
  };

  const applyCandidate = (c: TeamCandidate) => {
    const next: (TeamSlot | null)[] = [null, null, null, null, null, null];
    c.members.slice(0, 6).forEach((a, i) => {
      next[i] = {
        p: a.p,
        // Apply the Pokémon's ACTUAL stored set - item/moves/EVs/nature as they
        // are in the PC. Optimization suggestions (itemSuggestion, evTarget)
        // stay as advice in this Team tab and are never baked into the team.
        detail: {
          item: a.rec.item,
          ability: a.rec.ability || null,
          nature: a.rec.nature || null,
          level: a.rec.level,
          ivs: { ...a.rec.ivs },
          evs: { ...a.rec.evs },
          moves: a.rec.moves.length ? a.rec.moves : null,
        },
      };
    });
    setTeam(next);
    setImportMsg(`Applied "${c.label}" - ${c.members.length} Pokémon into slots.`);
  };

  const commitTeamRename = async (id: string) => {
    setRenamingTeamId(null);
    const next = teamRenameDraft.trim();
    if (!next || !bridge?.teamsLoad || !bridge.teamsSave) return;
    const rec = (await bridge.teamsLoad(id)) as LoadedTeamRecord | null;
    if (!rec || rec.name === next) return;
    await bridge.teamsSave({
      id: rec.id,
      name: next,
      rivenTag: rec.rivenTag,
      showdownExport: rec.showdownExport,
      members: rec.members,
    });
    if (currentTeamId === id) setTeamName(next);
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
          {pc.available && (
            <button
              type="button"
              className="chunky ghost font-display text-[12px]"
              style={{ padding: '6px 12px' }}
              onClick={onSyncFromPc}
              title="Refresh each slot's item, moves, EVs/IVs, nature and level from the matching PC Pokémon"
            >
              SYNC FROM PC
            </button>
          )}
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
          {team.map((slot, i) => {
            const p = slot?.p;
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
                  {(['species', 'pc', 'suggested'] as const).map((s) => (
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
                      {s === 'species' ? 'All species' : s === 'pc' ? `PC box · ${pc.mons.length}` : 'Suggested'}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="h-[320px]">
              {pickSource === 'pc' && pc.available ? (
                <div className="flex flex-col h-full">
                  <input
                    value={pcQuery}
                    onChange={(e) => setPcQuery(e.target.value)}
                    placeholder="Search your PC…"
                    aria-label="Search PC Pokémon"
                    className="bg-black/40 border border-white/15 rounded-full px-3 py-1.5 mb-2 font-mono-hud text-[14px] text-[var(--ink-0)] placeholder:text-[var(--ink-2)] outline-none focus:border-[var(--hud-accent-2)]"
                  />
                  {pcMonsFiltered.length === 0 ? (
                    <div className="font-mono-hud text-[14px] text-[var(--ink-2)] py-6 text-center">
                      {pc.loading
                        ? 'Loading PC…'
                        : pc.mons.length === 0
                          ? 'No Pokémon stored in the PC yet.'
                          : 'No PC Pokémon match your search.'}
                    </div>
                  ) : (
                    <div className="flex-1 min-h-0 overflow-y-auto pr-1 no-scrollbar flex flex-col gap-1">
                      {pcMonsFiltered.map((rec) => {
                        const sp = pokemonById[rec.speciesId];
                        if (!sp) return null;
                        return (
                          <button
                            key={rec.id}
                            type="button"
                            onClick={() => pickOwnedSpecies(sp)}
                            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-[10px] border border-white/10 bg-white/[.04] text-left hover:border-[var(--hud-accent-2)] transition"
                          >
                            <PokemonSprite dex={sp.dex} name={sp.name} size="xs" />
                            <span className="font-display text-[14px] font-semibold flex-1 min-w-0 truncate text-[var(--ink-0)]">
                              {rec.nickname || sp.name}
                              {rec.nickname && (
                                <span className="font-mono-hud text-[11px] text-[var(--ink-2)] ml-1.5">{sp.name}</span>
                              )}
                            </span>
                            <span className="flex gap-1 flex-shrink-0">
                              {sp.types.map((t) => (
                                <TypeChip key={t} t={t.toLowerCase()} />
                              ))}
                            </span>
                            <span className="font-mono-hud text-[12px] text-[var(--ink-1)] flex-shrink-0 w-12 text-right">
                              Lv {rec.level}
                            </span>
                            <span className="font-mono-hud text-[11px] uppercase tracking-wider text-[var(--ink-2)] flex-shrink-0">
                              {pc.boxNameById[rec.boxId] ?? 'Box'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : pickSource === 'suggested' && pc.available ? (
                pickerSuggestions.length === 0 ? (
                  <div className="font-mono-hud text-[14px] text-[var(--ink-2)] py-6 text-center">
                    {pc.loading
                      ? 'Loading PC…'
                      : ownedSpecies.length === 0
                        ? 'No Pokémon stored in the PC yet.'
                        : 'Every owned species is already on the team.'}
                  </div>
                ) : (
                  <div className="h-full overflow-y-auto pr-1 no-scrollbar flex flex-col gap-1">
                    <div className="font-mono-hud text-[11px] uppercase tracking-wider text-[var(--ink-2)] px-1 pb-1">
                      {teamMembers.length === 0
                        ? 'Owned species - add some to your team to rank these by synergy'
                        : 'Owned species ranked for this team · Smogon co-usage + coverage'}
                    </div>
                    {pickerSuggestions.map(({ p, reasons }) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => pickOwnedSpecies(p)}
                        className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-[10px] border border-white/10 bg-white/[.04] text-left hover:border-[var(--hud-accent-2)] transition"
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
                        <span className="flex gap-1 flex-shrink-0">
                          {p.types.map((t) => (
                            <TypeChip key={t} t={t.toLowerCase()} />
                          ))}
                        </span>
                      </button>
                    ))}
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

        {/* Team composition / role audit */}
        {teamMembers.length > 0 && (
          <TeamCompositionPanel
            slots={team.filter((s): s is TeamSlot => !!s)}
            pcMons={pcMons}
            dex={pokemon}
            smogon={smogon}
            moves={moves}
            intelBy={intelBy}
            onAdd={(p) => {
              const empty = team.findIndex((s) => s === null);
              if (empty >= 0) setSlot(empty, p);
            }}
          />
        )}

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

        {/* Best-6 builder over the PC collection */}
        {pc.available && (
          <div className="mono-panel p-3 rounded-[10px]">
            <div className="flex items-center justify-between gap-3">
              {sectionHead(
                'BUILD BEST 6 FROM PC',
                bestSix
                  ? `${bestSix.poolSize} pooled · ref lv ${bestSix.refLevel}${bestSix.excludedUnderleveled ? ` · ${bestSix.excludedUnderleveled} underleveled` : ''}${bestSix.excludedBanned ? ` · ${bestSix.excludedBanned} banned` : ''}`
                  : smogon
                    ? 'Smogon chemistry + coverage + level/IV quality'
                    : 'coverage + level/IV quality (no Smogon data)',
              )}
              <div className="flex items-center gap-3 mb-2">
                <label className="flex items-center gap-1.5 font-mono-hud text-[12px] uppercase tracking-wider text-[var(--ink-2)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={legalOnly}
                    onChange={(e) => setLegalOnly(e.target.checked)}
                  />
                  NatDex OU legal
                </label>
                <button
                  type="button"
                  className="chunky ghost font-display text-[12px]"
                  style={{ padding: '6px 12px' }}
                  onClick={() => setOwnedOpen((v) => !v)}
                  aria-expanded={ownedOpen}
                  title="Mega Stones / Z-Crystals are only suggested if you mark them owned here"
                >
                  ◇ ITEMS I OWN{ownedItems.size ? ` · ${ownedItems.size}` : ''}
                </button>
                <button
                  type="button"
                  className="chunky font-display text-[12px]"
                  style={{ '--c': 'var(--hud-accent-2)', padding: '6px 12px' } as React.CSSProperties}
                  onClick={onAnalyzePc}
                  disabled={pc.mons.length < 3}
                >
                  ANALYZE PC · {pc.mons.length}
                </button>
              </div>
            </div>

            {ownedOpen && (
              <div className="rounded-[10px] border border-white/10 bg-black/30 p-2.5 mb-2.5">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="font-mono-hud text-[12px] uppercase tracking-wider text-[var(--ink-2)]">
                    Mega Stones / Z-Crystals you own - only these get suggested (others fall back to craftable items)
                  </span>
                  <input
                    value={ownedQuery}
                    onChange={(e) => setOwnedQuery(e.target.value)}
                    placeholder="Search…"
                    aria-label="Search special items"
                    className="bg-black/40 border border-white/15 rounded-full px-3 py-1 font-mono-hud text-[13px] text-white outline-none focus:border-[var(--hud-accent-2)] w-[160px] flex-shrink-0"
                  />
                </div>
                <div className="max-h-[180px] overflow-y-auto grid grid-cols-3 gap-1 no-scrollbar pr-1">
                  {[...gatedItems.mega, ...gatedItems.zcrystal]
                    .filter((it) => it.name.toLowerCase().includes(ownedQuery.toLowerCase()))
                    .map((it) => {
                      const id = normItemId(it.name);
                      const on = ownedItems.has(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setOwnedItems(toggleOwnedItem(ownedItems, id))}
                          aria-pressed={on}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded-[8px] border text-left font-mono-hud text-[12px] transition ${
                            on
                              ? 'border-[var(--hud-accent-2)] bg-white/[.06] text-[var(--ink-0)]'
                              : 'border-white/10 text-[var(--ink-2)] hover:border-white/25'
                          }`}
                        >
                          <span className="flex-shrink-0">{on ? '☑' : '☐'}</span>
                          <span className="truncate">{it.name}</span>
                        </button>
                      );
                    })}
                </div>
                <div className="mt-1.5 font-mono-hud text-[11px] text-[var(--ink-2)]">
                  Re-analyze to apply your owned items.
                </div>
              </div>
            )}

            {!bestSix ? (
              <div className="font-mono-hud text-[14px] text-[var(--ink-2)] py-3 text-center">
                {pc.mons.length < 3
                  ? 'Store at least 3 Pokémon in the PC to build teams.'
                  : 'Analyze your PC to get ranked team candidates with per-mon optimization advice.'}
              </div>
            ) : bestSix.candidates.length === 0 ? (
              <div className="font-mono-hud text-[14px] text-[var(--ink-2)] py-3 text-center">
                Not enough battle-ready Pokémon - level some up first.
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2.5 items-start">
                {bestSix.candidates.map((c) => (
                  <div key={c.preset} className="rounded-[10px] border border-white/10 bg-white/[.03] p-2.5 flex flex-col gap-1.5 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display text-[14px] font-bold text-[var(--ink-0)]">{c.label}</span>
                      <span className="font-mono-hud text-[13px] tabular-nums text-[var(--hud-accent-2)]">
                        {c.score.toFixed(1)}
                      </span>
                    </div>
                    <div
                      className="font-mono-hud text-[10px] uppercase tracking-wider text-[var(--ink-2)]"
                      title="quality · chemistry · defense · offense · roles"
                    >
                      Q {c.breakdown.quality.toFixed(1)} · C {c.breakdown.chemistry.toFixed(1)} · D{' '}
                      {c.breakdown.defense.toFixed(1)} · O {c.breakdown.offense.toFixed(1)} · R{' '}
                      {c.breakdown.roles.toFixed(1)}
                    </div>
                    <div className="flex flex-col gap-1">
                      {c.members.map((a) => {
                        const key = `${c.preset}:${a.rec.id}`;
                        const lines = adviceLines(a);
                        return (
                          <div key={a.rec.id} className="rounded-[8px] border border-white/5 bg-black/20">
                            <button
                              type="button"
                              onClick={() => setExpandedAdvice(expandedAdvice === key ? null : key)}
                              className="w-full flex items-center gap-2 px-2 py-1 text-left"
                              title={lines.length ? 'Click for optimization advice' : 'Already optimal'}
                            >
                              <PokemonSprite dex={a.p.dex} name={a.p.name} size="xs" />
                              <span className="font-display text-[13px] font-semibold flex-1 min-w-0 truncate text-[var(--ink-0)]">
                                {a.rec.nickname || a.p.name}
                              </span>
                              <span className="font-mono-hud text-[10px] uppercase tracking-wider text-[var(--ink-2)] flex-shrink-0">
                                {a.role} · Lv {a.rec.level}
                              </span>
                              {lines.length > 0 && (
                                <span
                                  className="font-mono-hud text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                                  style={{
                                    color: lines.some((l) => l.danger) ? 'var(--hud-danger)' : 'var(--hud-accent-2)',
                                    background: 'rgba(0,0,0,.45)',
                                  }}
                                >
                                  {lines.length}
                                </span>
                              )}
                            </button>
                            {expandedAdvice === key && lines.length > 0 && (
                              <div className="px-2 pb-1.5 flex flex-col gap-0.5">
                                {a.matchedSetName && (
                                  <div className="font-mono-hud text-[10px] uppercase tracking-wider text-[var(--ink-2)]">
                                    vs {a.matchedSetName}
                                  </div>
                                )}
                                {lines.map((l, i) => (
                                  <div
                                    key={i}
                                    className="font-mono-hud text-[12px]"
                                    style={{ color: l.danger ? 'var(--hud-danger)' : 'var(--ink-1)' }}
                                  >
                                    {l.text}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {c.stackedWeaknesses.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 font-mono-hud text-[11px] uppercase tracking-wider text-[var(--ink-2)]">
                        weak:
                        {c.stackedWeaknesses.map((t) => (
                          <TypeChip key={t} t={t.toLowerCase()} />
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      className="chunky font-display text-[11px] mt-auto"
                      style={{ '--c': 'var(--hud-accent-2)', padding: '5px 10px' } as React.CSSProperties}
                      onClick={() => applyCandidate(c)}
                    >
                      APPLY TO SLOTS
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Saved teams - always visible, multiple squads */}
        <div className="mono-panel p-3 rounded-[10px]">
          <div className="flex items-center justify-between gap-3">
            {sectionHead('SAVED TEAMS', savedTeams.length ? `${savedTeams.length} stored locally` : 'none yet')}
            <div className="flex items-center gap-1.5 mb-2">
              <button
                type="button"
                className="chunky ghost font-display text-[11px]"
                style={{ padding: '4px 10px' }}
                onClick={onNew}
              >
                NEW
              </button>
              <button
                type="button"
                className="chunky ghost font-display text-[11px]"
                style={{ padding: '4px 10px' }}
                onClick={() => void onSaveAs()}
                disabled={teamMembers.length === 0}
              >
                SAVE AS
              </button>
            </div>
          </div>
          {savedTeams.length === 0 ? (
            <div className="font-mono-hud text-[14px] text-[var(--ink-2)] py-3 text-center">
              Build a squad and hit SAVE TEAM - every save is its own named team.
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {savedTeams.map((t) => (
                <div
                  key={t.id}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-[8px] border bg-white/[.03] ${
                    t.id === currentTeamId ? 'border-[var(--hud-accent-2)]/60' : 'border-white/5'
                  }`}
                >
                  {renamingTeamId === t.id ? (
                    <input
                      autoFocus
                      type="text"
                      value={teamRenameDraft}
                      aria-label="Team name"
                      onChange={(e) => setTeamRenameDraft(e.target.value)}
                      onBlur={() => void commitTeamRename(t.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void commitTeamRename(t.id);
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          setRenamingTeamId(null);
                        }
                      }}
                      className="flex-1 min-w-0 bg-black/40 border border-white/15 rounded-full px-3 py-0.5 font-display text-[14px] font-semibold text-white outline-none focus:border-[var(--hud-accent-2)]"
                    />
                  ) : (
                    <button
                      type="button"
                      title="Double-click to rename"
                      onDoubleClick={() => {
                        setTeamRenameDraft(t.name);
                        setRenamingTeamId(t.id);
                      }}
                      onClick={() => void onLoad(t.id)}
                      className="font-display text-[14px] font-semibold flex-1 min-w-0 truncate text-left text-[var(--ink-0)] hover:text-white transition"
                    >
                      {t.name}
                      {t.id === currentTeamId && (
                        <span className="font-mono-hud text-[10px] uppercase tracking-wider text-[var(--hud-accent-2)] ml-2">
                          loaded
                        </span>
                      )}
                    </button>
                  )}
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
          )}
        </div>
      </div>
    </ModuleFrame>
  );
}
