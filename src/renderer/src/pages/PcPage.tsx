import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Move, Pokemon } from '../lib/types';
import type { SmogonBundle, SmogonSpeciesIntel } from '../lib/smogon';
import { DexDetailModal } from '../components/DexDetailModal';
import type {
  PcBoxSummary,
  PcPokemonRecord,
  PcGender,
  SavePcPokemonPayload,
  TeamMemberPersist,
} from '../lib/bridgeTypes';
import { SpeciesList } from '../components/SpeciesList';
import { PokemonSprite } from '../components/PokemonSprite';
import { FocusLens } from '../components/hud/FocusLens';
import { toHudTeam } from '../lib/hudTeam';
import { ModuleFrame } from '../components/hud/ModuleFrame';
import { TypeChip } from '../components/hud/HudPrimitives';
import { GenderIcon } from '../components/GenderIcon';
import { ItemSearchInput } from '../components/ItemSearchInput';
import type { HeldItem } from '../lib/types';
import { NATURES, calcAllStats, bst, STAT_LABELS as PLANNER_STAT_LABELS } from '../lib/stats';
import { buildSpeciesFuse } from '../lib/fuzzySpecies';
import {
  DEFAULT_IVS,
  ZERO_EVS,
  PC_POKEMON_DRAG_TYPE,
  PC_BOX_DRAG_TYPE,
  PC_SLOTS_PER_BOX,
  STAT_ORDER,
  emptyMoves,
  firstEmptySlot,
  normalizeMoves,
} from '../lib/pc/defaults';
import { importPcFromShowdown, pcShowdownCacheKey, type PcShowdownImportMode } from '../lib/pc/import';
import {
  evTotalFromForm,
  numericFormFromSpread,
  parseNumericForm,
  previewNumericForm,
  type NumericFormFields,
} from '../lib/pc/editorForm';
import {
  downloadTextFile,
  exportAllBoxesMarkdown,
  exportBoxMarkdown,
  exportBoxShowdown,
  exportBoxTxt,
} from '../lib/pc/export';
import { reviewStoredMon, reviewReadiness, type OptSuggestion, type OptSeverity, type Readiness } from '../lib/pc/optimize';
import { computeTrPriorities, type TrPriorityEntry } from '../lib/pc/trPriority';
import { assignTr, type TrAssignResult, type TrAssignCandidate } from '../lib/pc/trAssign';
import { loadDismissed, toggleDismissed, dismissalId, partitionDismissed } from '../lib/pc/dismissedTips';
import { usePersistentState } from '../lib/usePersistentState';
import type { StatKey } from '../lib/types';

type EditorMode = 'closed' | 'pick-species' | 'view' | 'edit';

interface EditorDraft {
  id?: string;
  slot: number;
  species: Pokemon | null;
  nickname: string;
  level: number;
  gender: PcGender;
  nature: string;
  ability: string;
  item: string;
  ivs: typeof DEFAULT_IVS;
  evs: typeof ZERO_EVS;
  moves: string[];
  notes: string;
  shiny: boolean;
}

function emptyDraft(slot: number): EditorDraft {
  return {
    slot,
    species: null,
    nickname: '',
    level: 50,
    gender: 'genderless',
    nature: 'Hardy',
    ability: '',
    item: '',
    ivs: { ...DEFAULT_IVS },
    evs: { ...ZERO_EVS },
    moves: emptyMoves(),
    notes: '',
    shiny: false,
  };
}

interface PcDragPayload {
  pokemonId: string;
  fromBoxId: string;
  fromSlot: number;
}

function readDragPayload(dataTransfer: DataTransfer): PcDragPayload | null {
  const raw = dataTransfer.getData(PC_POKEMON_DRAG_TYPE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PcDragPayload;
    if (parsed.pokemonId && parsed.fromBoxId && typeof parsed.fromSlot === 'number') return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function draftFromRecord(mon: PcPokemonRecord, species: Pokemon | null): EditorDraft {
  return {
    id: mon.id,
    slot: mon.slot,
    species: species ?? null,
    nickname: mon.nickname ?? '',
    level: mon.level,
    gender: mon.gender,
    nature: mon.nature,
    ability: mon.ability,
    item: mon.item ?? '',
    ivs: { ...mon.ivs },
    evs: { ...mon.evs },
    moves: normalizeMoves(mon.moves),
    notes: mon.notes ?? '',
    shiny: mon.shiny,
  };
}

export function PcPage({
  pokemon,
  items,
  moves,
  smogon,
}: {
  pokemon: Pokemon[];
  items: HeldItem[];
  moves: Record<string, Move>;
  smogon: SmogonBundle | null;
}) {
  const bridge = typeof window !== 'undefined' ? window.assistant : undefined;
  const hasPc = !!bridge?.pcBoxesList;
  const [dexSpecies, setDexSpecies] = useState<Pokemon | null>(null);

  const [boxes, setBoxes] = useState<PcBoxSummary[]>([]);
  // Persisted so returning to the PC tab reopens the box you were in and, more
  // importantly, restores an in-progress add/edit draft instead of discarding
  // it the moment you click a box tab or navigate away. Saved mons live in the
  // DB; this keeps the *unsaved* editor draft from vanishing. usePersistentState
  // mirrors these to localStorage.
  const [activeBoxId, setActiveBoxId] = usePersistentState<string | null>('pc:activeBoxId', null);
  const [occupants, setOccupants] = useState<PcPokemonRecord[]>([]);
  const [selectedSlot, setSelectedSlot] = usePersistentState<number | null>('pc:selectedSlot', null);
  const [editor, setEditor] = usePersistentState<EditorDraft>('pc:editorDraft', () => emptyDraft(0));
  const [editorMode, setEditorMode] = usePersistentState<EditorMode>('pc:editorMode', 'closed');
  // Set-review tips the user has dismissed (species-scoped, persisted).
  const [dismissedTips, setDismissedTips] = useState<Set<string>>(() => loadDismissed());
  const toggleTip = useCallback(
    (speciesId: string, key: string) =>
      setDismissedTips((cur) => toggleDismissed(cur, dismissalId(speciesId, key))),
    [],
  );
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [paste, setPaste] = useState('');
  const [newBoxName, setNewBoxName] = useState('');
  const [renamingBox, setRenamingBox] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [tabRenameDraft, setTabRenameDraft] = useState('');
  const [boxCounts, setBoxCounts] = useState<Record<string, number>>({});
  // Species that sit on a saved team - they weight TM priorities up.
  const [teamSpeciesIds, setTeamSpeciesIds] = useState<Set<string>>(() => new Set());
  const [hasLastExport, setHasLastExport] = useState(false);
  const [dragOver, setDragOver] = useState<{ boxId: string; slot?: number } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingBoxId, setDraggingBoxId] = useState<string | null>(null);
  const [boxDropTargetId, setBoxDropTargetId] = useState<string | null>(null);
  const suppressClickRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pokemonById = useMemo(() => {
    const m: Record<string, Pokemon> = {};
    for (const p of pokemon) m[p.id] = p;
    return m;
  }, [pokemon]);

  const speciesFuse = useMemo(() => buildSpeciesFuse(pokemon), [pokemon]);

  // The selected mon rendered in the home-style read-only FocusLens card. Built
  // from the live editor draft so the view reflects whatever is on screen.
  const viewerMon = useMemo(() => {
    if (!editor.species) return null;
    const member: TeamMemberPersist = {
      slot: editor.slot,
      speciesId: editor.species.id,
      speciesDisplay: editor.species.name,
      item: editor.item.trim() || null,
      ability: editor.ability || null,
      nature: editor.nature,
      level: editor.level,
      ivs: { ...editor.ivs },
      evs: { ...editor.evs },
      moves: editor.moves,
    };
    const mon = toHudTeam([member], pokemonById, moves)[0] ?? null;
    if (mon && editor.nickname.trim()) mon.name = editor.nickname.trim();
    return mon;
  }, [editor, pokemonById, moves]);

  const activeBox = boxes.find((b) => b.id === activeBoxId) ?? null;

  const slotMap = useMemo(() => {
    const m = new Map<number, PcPokemonRecord>();
    for (const p of occupants) m.set(p.slot, p);
    return m;
  }, [occupants]);

  // Per-slot competitive-readiness verdict (vs Smogon usage) for the corner dot.
  const readinessBySlot = useMemo(() => {
    const m = new Map<number, Readiness>();
    if (!smogon) return m;
    for (const mon of occupants) {
      const sp = pokemonById[mon.speciesId];
      if (!sp) continue;
      const intel = smogon.species[sp.id] ?? null;
      if (!intel) {
        m.set(mon.slot, 'unknown');
        continue;
      }
      const suggestions = reviewStoredMon(
        { moves: mon.moves, nature: mon.nature, item: mon.item ?? null, ability: mon.ability, evs: mon.evs, ivs: mon.ivs },
        sp,
        intel,
      );
      // Dismissed tips shouldn't keep a slot's dot red.
      const { active } = partitionDismissed(suggestions, sp.id, dismissedTips);
      m.set(mon.slot, reviewReadiness(active));
    }
    return m;
  }, [occupants, pokemonById, smogon, dismissedTips]);

  // Load the species sitting on saved teams so TM priorities can weight them up.
  useEffect(() => {
    if (!bridge?.teamsList || !bridge.teamsLoad) return;
    let cancelled = false;
    (async () => {
      const list = await bridge.teamsList!();
      const ids = new Set<string>();
      for (const t of list) {
        const full = await bridge.teamsLoad!(t.id);
        for (const mb of full?.members ?? []) if (mb.speciesId) ids.add(mb.speciesId);
      }
      if (!cancelled) setTeamSpeciesIds(ids);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  // Ranked taught-moves (TMs) worth acquiring for the mons in this box.
  const trPriorities = useMemo(
    () =>
      computeTrPriorities(
        occupants.map((o) => ({ speciesId: o.speciesId, moves: o.moves })),
        pokemonById,
        moves,
        smogon,
        teamSpeciesIds,
      ),
    [occupants, pokemonById, moves, smogon, teamSpeciesIds],
  );

  // "Who should I give this TM to?" - the inverse query. Pick a move; rank the
  // box mons that can learn it and want it. The picker is scoped to the moves at
  // least one mon here can actually be taught (the records that matter for box).
  const [trAssignMove, setTrAssignMove] = useState('');
  const boxTeachableMoves = useMemo(() => {
    const seen = new Map<string, string>(); // moveId -> display name
    for (const o of occupants) {
      const sp = pokemonById[o.speciesId];
      if (!sp) continue;
      for (const lm of sp.moves) {
        if (lm.learn !== 'tm' && lm.learn !== 'tutor') continue;
        const id = lm.move.toLowerCase().replace(/[^a-z0-9]/g, '');
        const m = moves[id];
        if (m && !seen.has(id)) seen.set(id, m.name);
      }
    }
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [occupants, pokemonById, moves]);

  const trAssignResult = useMemo(() => {
    const id = trAssignMove.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!id) return null;
    return assignTr(
      id,
      occupants.map((o) => ({ slot: o.slot, speciesId: o.speciesId, nickname: o.nickname, moves: o.moves })),
      pokemonById,
      moves,
      smogon,
      teamSpeciesIds,
    );
  }, [trAssignMove, occupants, pokemonById, moves, smogon, teamSpeciesIds]);

  const refreshBoxes = useCallback(async () => {
    if (!bridge?.pcBoxesList) return;
    const list = await bridge.pcBoxesList();
    setBoxes(list);
    if (!activeBoxId && list[0]) setActiveBoxId(list[0].id);
    else if (activeBoxId && !list.some((b) => b.id === activeBoxId) && list[0]) {
      setActiveBoxId(list[0].id);
    }
    if (bridge.pcPokemonList) {
      const counts = await Promise.all(
        list.map(async (b) => {
          const rows = await bridge.pcPokemonList!(b.id);
          return [b.id, rows.length] as const;
        }),
      );
      setBoxCounts(Object.fromEntries(counts));
    }
  }, [bridge, activeBoxId, setActiveBoxId]);

  const refreshPokemon = useCallback(async () => {
    if (!bridge?.pcPokemonList || !activeBoxId) {
      setOccupants([]);
      return;
    }
    const rows = await bridge.pcPokemonList(activeBoxId);
    setOccupants(rows);
    setBoxCounts((prev) => ({ ...prev, [activeBoxId]: rows.length }));
  }, [bridge, activeBoxId]);

  useEffect(() => {
    void refreshBoxes();
  }, [refreshBoxes]);

  useEffect(() => {
    void refreshPokemon();
  }, [refreshPokemon]);

  useEffect(() => {
    if (!activeBoxId) {
      setHasLastExport(false);
      return;
    }
    setHasLastExport(!!sessionStorage.getItem(pcShowdownCacheKey(activeBoxId)));
    setRenamingBox(false);
  }, [activeBoxId]);

  const startRenameBox = () => {
    if (!activeBox) return;
    setRenameDraft(activeBox.name);
    setRenamingBox(true);
  };

  const commitRenameBox = async () => {
    if (!activeBox || !bridge?.pcBoxRename) {
      setRenamingBox(false);
      return;
    }
    const next = renameDraft.trim();
    if (!next || next === activeBox.name) {
      setRenamingBox(false);
      return;
    }
    await bridge.pcBoxRename(activeBox.id, next);
    setRenamingBox(false);
    await refreshBoxes();
    setStatusMsg(`Renamed box to “${next}”.`);
  };

  const cancelRenameBox = () => {
    setRenamingBox(false);
  };

  const commitTabRename = async (box: PcBoxSummary) => {
    setRenamingTabId(null);
    if (!bridge?.pcBoxRename) return;
    const next = tabRenameDraft.trim();
    if (!next || next === box.name) return;
    await bridge.pcBoxRename(box.id, next);
    await refreshBoxes();
    setStatusMsg(`Renamed box to “${next}”.`);
  };

  const openEmptySlot = (slot: number) => {
    setSelectedSlot(slot);
    setEditor(emptyDraft(slot));
    setEditorMode('pick-species');
    setStatusMsg(null);
  };

  const openExisting = (mon: PcPokemonRecord) => {
    setSelectedSlot(mon.slot);
    setEditor(draftFromRecord(mon, pokemonById[mon.speciesId] ?? null));
    setEditorMode('view');
    setStatusMsg(null);
  };

  const clearDragUi = () => {
    setDragOver(null);
    setDraggingId(null);
    setDraggingBoxId(null);
    setBoxDropTargetId(null);
  };

  // Reorder box tabs by dropping one tab onto another. Persists the new order;
  // optimistically reorders the local list so the UI doesn't flash.
  const reorderBoxesByDrop = useCallback(
    async (fromId: string, toId: string) => {
      if (fromId === toId) return;
      const ids = boxes.map((b) => b.id);
      if (ids.indexOf(fromId) < 0 || ids.indexOf(toId) < 0) return;
      const [moved] = ids.splice(ids.indexOf(fromId), 1);
      // Insert before the drop target (recompute its index after removal).
      ids.splice(ids.indexOf(toId), 0, moved);
      setBoxes((prev) => ids.map((id) => prev.find((b) => b.id === id)!).filter(Boolean));
      if (bridge?.pcBoxReorder) {
        await bridge.pcBoxReorder(ids);
        await refreshBoxes();
      }
    },
    [boxes, bridge, refreshBoxes],
  );

  const movePokemon = useCallback(
    async (payload: PcDragPayload, toBoxId: string, toSlot: number) => {
      if (!bridge?.pcPokemonMove) return;
      if (payload.fromBoxId === toBoxId && payload.fromSlot === toSlot) return;
      await bridge.pcPokemonMove(payload.pokemonId, toBoxId, toSlot);
      await refreshBoxes();
      if (activeBoxId === toBoxId || activeBoxId === payload.fromBoxId) {
        await refreshPokemon();
      }
      if (editor.id === payload.pokemonId) {
        setEditorMode('closed');
        setSelectedSlot(null);
      }
    },
    [bridge, activeBoxId, editor.id, refreshBoxes, refreshPokemon, setEditorMode, setSelectedSlot],
  );

  const onPickSpecies = (p: Pokemon) => {
    setEditor((d) => ({
      ...d,
      species: p,
      ability: d.ability || p.abilities[0] || p.hiddenAbilities[0] || '',
    }));
    setEditorMode('edit');
  };

  const saveDraft = async (draft: EditorDraft) => {
    if (!bridge?.pcPokemonSave || !activeBoxId || !draft.species) return;
    const payload: SavePcPokemonPayload = {
      id: draft.id,
      boxId: activeBoxId,
      slot: draft.slot,
      speciesId: draft.species.id,
      speciesDisplay: draft.species.name,
      nickname: draft.nickname.trim() || null,
      level: Math.max(1, Math.min(100, draft.level)),
      gender: draft.gender,
      nature: draft.nature,
      ability: draft.ability,
      item: draft.item.trim() || null,
      ivs: draft.ivs,
      evs: draft.evs,
      moves: normalizeMoves(draft.moves),
      notes: draft.notes.trim() || null,
      shiny: draft.shiny,
    };
    await bridge.pcPokemonSave(payload);
    setEditor(draft);
    setStatusMsg(`Saved ${draft.species.name} to slot ${draft.slot + 1}.`);
    // Drop back to the read-only card so the freshly-saved set is on display.
    setEditorMode('view');
    setSelectedSlot(draft.slot);
    await refreshPokemon();
    await refreshBoxes();
  };

  const deleteAtSlot = async (mon: PcPokemonRecord) => {
    if (!bridge?.pcPokemonDelete) return;
    if (!confirm(`Remove ${mon.speciesDisplay} from this box?`)) return;
    await bridge.pcPokemonDelete(mon.id);
    setEditorMode('closed');
    setSelectedSlot(null);
    await refreshPokemon();
    setStatusMsg('Pokémon removed.');
  };

  const formatImportStatus = (
    result: Awaited<ReturnType<typeof importPcFromShowdown>>,
    mode: PcShowdownImportMode,
  ) => {
    const parts = [`Imported ${result.placed} Pokémon${mode === 'replace' ? ' (box replaced)' : ''}.`];
    if (result.skippedUnknown.length) {
      parts.push(`Unknown species: ${result.skippedUnknown.slice(0, 5).join(', ')}${result.skippedUnknown.length > 5 ? '…' : ''}.`);
    }
    if (result.skippedFull) parts.push(`${result.skippedFull} skipped (box full).`);
    return parts.join(' ');
  };

  const importShowdown = async (mode: PcShowdownImportMode, text?: string) => {
    if (!bridge?.pcPokemonSave || !bridge.pcPokemonDelete || !activeBoxId) return;
    const raw = (text ?? paste).trim();
    if (!raw) {
      setStatusMsg('Nothing to import. Paste Showdown text or choose a file.');
      return;
    }
    if (mode === 'replace' && occupants.length) {
      const label = activeBox?.name ?? 'this box';
      if (!confirm(`Replace all Pokémon in “${label}”?`)) return;
    }
    const result = await importPcFromShowdown({
      paste: raw,
      boxId: activeBoxId,
      mode,
      speciesFuse,
      occupants,
      save: (p) => bridge.pcPokemonSave!(p),
      deleteMon: (id) => bridge.pcPokemonDelete!(id),
    });
    if (!result.placed && !result.skippedUnknown.length) {
      setStatusMsg('No Pokémon blocks found. Use Showdown format with blank lines between species.');
      return;
    }
    setEditorMode('closed');
    setSelectedSlot(null);
    if (text) setPaste(text);
    await refreshPokemon();
    await refreshBoxes();
    setStatusMsg(formatImportStatus(result, mode));
  };

  const reimportLastExport = () => {
    if (!activeBoxId) return;
    const cached = sessionStorage.getItem(pcShowdownCacheKey(activeBoxId));
    if (!cached) {
      setStatusMsg('No export cached for this box. Export Showdown first.');
      return;
    }
    void importShowdown('replace', cached);
  };

  const onShowdownFile = async (file: File) => {
    const text = await file.text();
    setPaste(text);
    await importShowdown('replace', text);
  };

  const exportCurrentBoxMd = () => {
    if (!activeBox) return;
    const text = exportBoxMarkdown(activeBox, occupants, pokemonById);
    downloadTextFile(`${slugify(activeBox.name)}.md`, text, 'text/markdown;charset=utf-8');
    setStatusMsg('Downloaded Markdown export.');
  };

  const exportCurrentBoxTxt = () => {
    if (!activeBox) return;
    const text = exportBoxTxt(activeBox, occupants, pokemonById);
    downloadTextFile(`${slugify(activeBox.name)}.txt`, text, 'text/plain;charset=utf-8');
    setStatusMsg('Downloaded text export.');
  };

  const exportCurrentBoxShowdown = () => {
    if (!activeBox) return;
    const text = exportBoxShowdown(activeBox, occupants);
    sessionStorage.setItem(pcShowdownCacheKey(activeBox.id), text);
    setHasLastExport(true);
    downloadTextFile(`${slugify(activeBox.name)}-showdown.txt`, text, 'text/plain;charset=utf-8');
    setStatusMsg('Downloaded Showdown paste. Use “Re-import last export” to restore this box.');
  };

  const exportAllMd = async () => {
    if (!bridge?.pcPokemonList) return;
    const map = new Map<string, PcPokemonRecord[]>();
    for (const box of boxes) {
      map.set(box.id, await bridge.pcPokemonList(box.id));
    }
    const text = exportAllBoxesMarkdown(boxes, map, pokemonById);
    downloadTextFile('pc-export-all.md', text, 'text/markdown;charset=utf-8');
    setStatusMsg('Downloaded full PC Markdown export.');
  };

  if (!hasPc) {
    return (
      <ModuleFrame kicker="PC STORAGE" title="PC Storage" subtitle="desktop app required">
        <p className="font-mono-hud text-[15px] text-[var(--ink-2)] m-0">
          PC storage requires the desktop app (Electron). Run with <code>npm run dev</code>.
        </p>
      </ModuleFrame>
    );
  }

  return (
    <ModuleFrame
      kicker="PC STORAGE"
      title={activeBox?.name ?? 'PC Storage'}
      subtitle={
        activeBox
          ? `${occupants.length} / ${PC_SLOTS_PER_BOX} · stored locally`
          : 'drag to move · drop on occupied slot to swap'
      }
      side={
        <div className="flex flex-wrap items-center gap-1.5 justify-end">
          <button type="button" className="chunky ghost font-display text-[11px]" style={{ padding: '5px 10px' }} onClick={exportCurrentBoxMd} disabled={!activeBox}>
            MD
          </button>
          <button type="button" className="chunky ghost font-display text-[11px]" style={{ padding: '5px 10px' }} onClick={exportCurrentBoxTxt} disabled={!activeBox}>
            TXT
          </button>
          <button type="button" className="chunky ghost font-display text-[11px]" style={{ padding: '5px 10px' }} onClick={exportCurrentBoxShowdown} disabled={!activeBox}>
            SHOWDOWN
          </button>
          <button type="button" className="chunky ghost font-display text-[11px]" style={{ padding: '5px 10px' }} onClick={() => void exportAllMd()} disabled={!boxes.length}>
            ALL · MD
          </button>
        </div>
      }
    >
      <div className="pc-page mod-page hud-form">
      {statusMsg && (
        <div className="font-mono-hud text-[14px] text-[var(--ink-1)] mb-3" role="status">
          › {statusMsg}
        </div>
      )}
      <div className="pc-layout">
        <div className="panel pc-box-tabs">
          <div className="box-tabs" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {boxes.map((b) =>
              renamingTabId === b.id ? (
                <input
                  key={b.id}
                  autoFocus
                  type="text"
                  className="box-tab box-tab-active"
                  value={tabRenameDraft}
                  aria-label="Box name"
                  onChange={(e) => setTabRenameDraft(e.target.value)}
                  onBlur={() => void commitTabRename(b)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void commitTabRename(b);
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setRenamingTabId(null);
                    }
                  }}
                />
              ) : (
              <button
                key={b.id}
                type="button"
                draggable
                title="Drag to reorder · double-click to rename"
                className={[
                  'box-tab',
                  b.id === activeBoxId ? 'box-tab-active' : '',
                  (dragOver?.boxId === b.id && dragOver.slot === undefined) || boxDropTargetId === b.id
                    ? 'pc-drag-over'
                    : '',
                  draggingBoxId === b.id ? 'pc-drag-source' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => {
                  if (suppressClickRef.current) {
                    suppressClickRef.current = false;
                    return;
                  }
                  setActiveBoxId(b.id);
                  setEditorMode('closed');
                  setSelectedSlot(null);
                }}
                onDoubleClick={() => {
                  setTabRenameDraft(b.name);
                  setRenamingTabId(b.id);
                }}
                onDragStart={(e) => {
                  e.dataTransfer.setData(PC_BOX_DRAG_TYPE, b.id);
                  e.dataTransfer.effectAllowed = 'move';
                  setDraggingBoxId(b.id);
                }}
                onDragEnd={() => {
                  clearDragUi();
                  suppressClickRef.current = true;
                }}
                onDragOver={(e) => {
                  const boxId = e.dataTransfer.getData(PC_BOX_DRAG_TYPE) || draggingBoxId;
                  if (boxId) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setBoxDropTargetId(b.id);
                    return;
                  }
                  const payload = readDragPayload(e.dataTransfer);
                  if (!payload) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setDragOver({ boxId: b.id });
                }}
                onDragLeave={() => {
                  setDragOver((prev) => (prev?.boxId === b.id && prev.slot === undefined ? null : prev));
                  setBoxDropTargetId((prev) => (prev === b.id ? null : prev));
                }}
                onDrop={async (e) => {
                  e.preventDefault();
                  // Box reorder takes priority - its drag carries a box id.
                  const fromBoxId = e.dataTransfer.getData(PC_BOX_DRAG_TYPE) || draggingBoxId;
                  if (fromBoxId) {
                    clearDragUi();
                    suppressClickRef.current = true;
                    await reorderBoxesByDrop(fromBoxId, b.id);
                    return;
                  }
                  const payload = readDragPayload(e.dataTransfer);
                  clearDragUi();
                  suppressClickRef.current = true;
                  if (!payload || !bridge?.pcPokemonList) return;
                  if (payload.fromBoxId === b.id) return;
                  const rows = await bridge.pcPokemonList(b.id);
                  const slot = firstEmptySlot(rows);
                  if (slot === null) {
                    setStatusMsg(`“${b.name}” is full (${PC_SLOTS_PER_BOX}/${PC_SLOTS_PER_BOX}).`);
                    return;
                  }
                  await movePokemon(payload, b.id, slot);
                  setActiveBoxId(b.id);
                  setEditorMode('closed');
                  setSelectedSlot(null);
                  const targetBox = boxes.find((x) => x.id === b.id);
                  setStatusMsg(`Moved to ${targetBox?.name ?? 'box'}, slot ${slot + 1}.`);
                }}
              >
                {b.name}
                <span className="box-count mono">
                  {boxCounts[b.id] ?? '-'}/{PC_SLOTS_PER_BOX}
                </span>
              </button>
              ),
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, minWidth: 0 }}>
            <input
              type="text"
              placeholder="New box name"
              value={newBoxName}
              onChange={(e) => setNewBoxName(e.target.value)}
              style={{ flex: 1, minWidth: 0, width: '100%' }}
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={async () => {
                const created = await bridge!.pcBoxCreate!(newBoxName);
                setNewBoxName('');
                setActiveBoxId(created.id);
                await refreshBoxes();
              }}
            >
              + Box
            </button>
          </div>
          {activeBox && (
            <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={async () => {
                  if (!confirm(`Delete box "${activeBox.name}" and all Pokémon inside?`)) return;
                  await bridge!.pcBoxDelete!(activeBox.id);
                  setActiveBoxId(null);
                  await refreshBoxes();
                }}
              >
                Delete box
              </button>
            </div>
          )}
        </div>

        <div className="panel pc-grid-panel">
          <div className="section-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            {activeBox ? (
              renamingBox ? (
                <input
                  autoFocus
                  type="text"
                  className="pc-box-rename-input"
                  value={renameDraft}
                  aria-label="Box name"
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onBlur={() => void commitRenameBox()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void commitRenameBox();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelRenameBox();
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="pc-box-rename-trigger"
                  onClick={startRenameBox}
                  title="Click to rename box"
                >
                  {activeBox.name}
                </button>
              )
            ) : (
              <span>Select a box</span>
            )}
            <div className="flex items-center gap-3">
              {smogon && occupants.length > 0 && <ReadinessLegend />}
              <span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
                {occupants.length} / {PC_SLOTS_PER_BOX}
              </span>
            </div>
          </div>
          <div className="box-grid">
            {Array.from({ length: PC_SLOTS_PER_BOX }, (_, slot) => {
              const mon = slotMap.get(slot);
              const selected = selectedSlot === slot;
              const types = mon ? pokemonById[mon.speciesId]?.types.join(' ') : '';
              const isDragSource = mon && draggingId === mon.id;
              const isDragTarget =
                !!activeBoxId && dragOver?.boxId === activeBoxId && dragOver.slot === slot;
              return (
                <div
                  key={slot}
                  role="button"
                  tabIndex={0}
                  draggable={!!mon}
                  className={[
                    'box-cell',
                    selected ? 'box-cell-selected' : '',
                    mon ? 'box-cell-filled' : 'box-cell-empty',
                    isDragSource ? 'pc-drag-source' : '',
                    isDragTarget ? 'pc-drag-over' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  data-types={types || undefined}
                  onClick={() => {
                    if (suppressClickRef.current) {
                      suppressClickRef.current = false;
                      return;
                    }
                    if (mon) openExisting(mon);
                    else openEmptySlot(slot);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (mon) openExisting(mon);
                      else openEmptySlot(slot);
                    }
                  }}
                  onDragStart={(e) => {
                    if (!mon || !activeBoxId) return;
                    const payload: PcDragPayload = {
                      pokemonId: mon.id,
                      fromBoxId: activeBoxId,
                      fromSlot: mon.slot,
                    };
                    e.dataTransfer.setData(PC_POKEMON_DRAG_TYPE, JSON.stringify(payload));
                    e.dataTransfer.effectAllowed = 'move';
                    setDraggingId(mon.id);
                  }}
                  onDragEnd={() => {
                    clearDragUi();
                    suppressClickRef.current = true;
                  }}
                  onDragOver={(e) => {
                    if (!readDragPayload(e.dataTransfer) || !activeBoxId) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setDragOver({ boxId: activeBoxId, slot });
                  }}
                  onDragLeave={() => {
                    setDragOver((prev) =>
                      prev?.boxId === activeBoxId && prev.slot === slot ? null : prev,
                    );
                  }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    const payload = readDragPayload(e.dataTransfer);
                    clearDragUi();
                    suppressClickRef.current = true;
                    if (!payload || !activeBoxId) return;
                    if (payload.fromBoxId === activeBoxId && payload.fromSlot === slot) return;
                    await movePokemon(payload, activeBoxId, slot);
                    if (mon) {
                      setStatusMsg(`Swapped slots ${payload.fromSlot + 1} and ${slot + 1}.`);
                    } else {
                      setStatusMsg(`Moved to slot ${slot + 1}.`);
                    }
                  }}
                >
                  {mon ? (
                    <>
                      <GenderIcon gender={mon.gender} className="cell-gender" />
                      {mon.shiny && (
                        <span className="cell-shiny" title="Shiny" aria-label="Shiny">
                          ✦
                        </span>
                      )}
                      <ReadinessDot level={readinessBySlot.get(slot)} />
                      <div className="cell-portrait">
                        <PokemonSprite
                          dex={pokemonById[mon.speciesId]?.dex ?? 0}
                          name={mon.nickname || mon.speciesDisplay}
                          size="xs"
                          variant={mon.shiny ? 'shiny' : 'default'}
                        />
                      </div>
                      <div className="cell-name">{mon.nickname || mon.speciesDisplay}</div>
                      <div className="cell-meta mono">Lv.{mon.level}</div>
                    </>
                  ) : (
                    <span style={{ fontSize: 20, color: 'var(--fg-3)' }}>+</span>
                  )}
                </div>
              );
            })}
          </div>

          {smogon && <TrPriorityPanel entries={trPriorities} hasMons={occupants.length > 0} />}

          <TrAssignPanel
            value={trAssignMove}
            onChange={setTrAssignMove}
            options={boxTeachableMoves}
            result={trAssignResult}
            hasMons={occupants.length > 0}
          />

          <div style={{ marginTop: 14 }}>
            <div className="section-head">Showdown round-trip</div>
            <p style={{ fontSize: 12, color: 'var(--fg-dim)', margin: '0 0 8px' }}>
              Export and re-import the same Showdown file to restore a full box (up to {PC_SLOTS_PER_BOX} Pokémon).
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,text/plain"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void onShowdownFile(file);
              }}
            />
            <textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder="Paste Showdown export (blank line between Pokémon)…"
              rows={4}
              style={{ width: '100%', resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 12 }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!activeBox}
                onClick={() => void importShowdown('replace')}
              >
                Replace box from paste
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={!activeBox || !hasLastExport}
                onClick={reimportLastExport}
                title={hasLastExport ? 'Restore from your last Showdown export of this box' : 'Export Showdown first'}
              >
                Re-import last export
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={!activeBox}
                onClick={() => fileInputRef.current?.click()}
              >
                Import from file…
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={!activeBox}
                onClick={() => void importShowdown('fill')}
              >
                Add to empty slots
              </button>
            </div>
          </div>
        </div>

        <div className="panel pc-editor-panel">
          {editorMode === 'closed' && (
            <p style={{ color: 'var(--fg-dim)', fontSize: 13, margin: 0 }}>
              Click an empty slot to add a Pokémon, or an occupied slot to edit.
            </p>
          )}

          {editorMode === 'pick-species' && (
            <>
              <div className="section-head">Slot {editor.slot + 1} · pick species</div>
              <SpeciesList pokemon={pokemon} onSelect={onPickSpecies} />
              <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setEditorMode('closed')}>
                Cancel
              </button>
            </>
          )}

          {editorMode === 'view' && editor.species && viewerMon && (
            <div className="pc-view">
              <div className="pc-view-actions">
                <span className="font-mono-hud text-[12px] text-[var(--ink-2)] uppercase tracking-wider">
                  Slot {editor.slot + 1}
                </span>
                {editor.shiny && (
                  <span
                    className="font-mono-hud text-[12px]"
                    style={{ color: 'var(--hud-accent)' }}
                    title="Shiny"
                  >
                    ✦ Shiny
                  </span>
                )}
                <button
                  type="button"
                  className="chunky font-display text-[11px]"
                  style={{ padding: '4px 12px', marginLeft: 'auto' }}
                  onClick={() => setEditorMode('edit')}
                  title="Edit this Pokémon"
                >
                  EDIT
                </button>
                <button
                  type="button"
                  className="chunky ghost font-display text-[11px]"
                  style={{ padding: '4px 10px' }}
                  onClick={() => editor.species && setDexSpecies(editor.species)}
                  title={`Open the Pokédex entry for ${editor.species.name}`}
                >
                  POKÉDEX
                </button>
              </div>

              <FocusLens mon={viewerMon} />

              {editor.notes.trim() && (
                <div className="pc-view-notes">
                  <span className="cell-label">Notes</span>
                  <p>{editor.notes.trim()}</p>
                </div>
              )}

              {editor.id && (
                <div style={{ display: 'flex', marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => {
                      const mon = occupants.find((o) => o.id === editor.id);
                      if (mon) void deleteAtSlot(mon);
                    }}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          )}

          {editorMode === 'edit' && editor.species && (
            <PcEditor
              draft={editor}
              species={editor.species}
              items={items}
              intel={smogon?.species[editor.species.id] ?? null}
              metaLabel={smogon?.meta.label ?? null}
              dismissed={dismissedTips}
              onToggleDismiss={toggleTip}
              onViewDex={() => editor.species && setDexSpecies(editor.species)}
              onCommit={setEditor}
              onSave={(committed) => void saveDraft(committed)}
              onCancel={() => {
                // Explicit discard: drop the persisted in-progress edits and
                // fall back to the saved record (existing mon) or clear the
                // slot entirely (new mon).
                if (editor.id) {
                  const mon = occupants.find((o) => o.id === editor.id);
                  if (mon) setEditor(draftFromRecord(mon, pokemonById[mon.speciesId] ?? null));
                  setEditorMode('view');
                } else {
                  setEditor(emptyDraft(editor.slot));
                  setEditorMode('closed');
                  setSelectedSlot(null);
                }
              }}
              onDelete={
                editor.id
                  ? () => {
                      const mon = occupants.find((o) => o.id === editor.id);
                      if (mon) void deleteAtSlot(mon);
                    }
                  : undefined
              }
            />
          )}
        </div>
      </div>
      </div>
      {dexSpecies && (
        <DexDetailModal
          species={dexSpecies}
          pokemonById={pokemonById}
          moves={moves}
          smogon={smogon}
          onClose={() => setDexSpecies(null)}
        />
      )}
    </ModuleFrame>
  );
}

function PcEditor({
  draft,
  species,
  items,
  intel,
  metaLabel,
  dismissed,
  onToggleDismiss,
  onViewDex,
  onCommit,
  onSave,
  onCancel,
  onDelete,
}: {
  draft: EditorDraft;
  species: Pokemon;
  items: HeldItem[];
  intel: SmogonSpeciesIntel | null;
  metaLabel: string | null;
  dismissed: Set<string>;
  onToggleDismiss: (speciesId: string, key: string) => void;
  onViewDex: () => void;
  onCommit: (d: EditorDraft) => void;
  onSave: (committed: EditorDraft) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const draftKey = `${draft.id ?? 'new'}:${draft.slot}:${species.id}`;
  const [local, setLocal] = useState(draft);
  const [numeric, setNumeric] = useState<NumericFormFields>(() =>
    numericFormFromSpread(draft.level, draft.ivs, draft.evs),
  );
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    setLocal(draft);
    setNumeric(numericFormFromSpread(draft.level, draft.ivs, draft.evs));
    setFieldError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when a different mon opens; draft changes on every keystroke
  }, [draftKey]);

  // Continuously lift in-progress edits to the parent draft (which is
  // persisted) so they survive an accidental click-out or navigation instead of
  // living only in this component's local state until Save. Depends solely on
  // the editable state so it can't loop against the parent re-render. Explicit
  // discard is handled by the parent's onCancel.
  useEffect(() => {
    const p = previewNumericForm(numeric, { level: draft.level, ivs: draft.ivs, evs: draft.evs });
    onCommit({ ...local, level: p.level, ivs: p.ivs, evs: p.evs });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local, numeric]);

  const set = <K extends keyof EditorDraft>(key: K, val: EditorDraft[K]) => setLocal((d) => ({ ...d, [key]: val }));

  const preview = previewNumericForm(numeric, { level: draft.level, ivs: draft.ivs, evs: draft.evs });
  const computed = calcAllStats(species.baseStats, preview.ivs, preview.evs, preview.level, local.nature);
  const evTotal = evTotalFromForm(numeric);

  // Hover hint for the EVs header: explain the caps and flag values that waste
  // EVs - only multiples of 4 raise a stat, and a single stat is capped at 252.
  const evTooltip = (() => {
    const warns: string[] = [];
    if (evTotal > 510) warns.push(`⚠ Over the 510 total by ${evTotal - 510}`);
    for (const k of STAT_ORDER) {
      const v = parseInt(numeric.evs[k], 10) || 0;
      if (v > 252) warns.push(`⚠ ${PLANNER_STAT_LABELS[k]} ${v} → over the 252 cap (use 252)`);
      else if (v % 4 !== 0) {
        const lo = v - (v % 4);
        warns.push(`⚠ ${PLANNER_STAT_LABELS[k]} ${v} → wastes ${v % 4} (use ${lo} or ${lo + 4})`);
      }
    }
    return ['252-per-stat cap · only multiples of 4 raise a stat', ...warns].join('\n');
  })();

  const review = useMemo(
    () =>
      reviewStoredMon(
        {
          moves: local.moves,
          nature: local.nature,
          item: local.item.trim() || null,
          ability: local.ability,
          evs: preview.evs,
          ivs: preview.ivs,
        },
        species,
        intel,
      ),
    [local.moves, local.nature, local.item, local.ability, preview.evs, preview.ivs, species, intel],
  );
  const { active: activeReview, hidden: hiddenReview } = useMemo(
    () => partitionDismissed(review, species.id, dismissed),
    [review, species.id, dismissed],
  );

  const applyFix = (s: OptSuggestion) => {
    const fix = s.fix;
    if (!fix) return;
    setLocal((d) => {
      const next = { ...d };
      if (fix.nature) next.nature = fix.nature;
      if (fix.item !== undefined) next.item = fix.item;
      if (fix.ability) next.ability = fix.ability;
      if (fix.addMove) {
        const moves = [...next.moves];
        const target = norm(fix.replaceMove ?? '');
        let idx = target ? moves.findIndex((m) => norm(m) === target) : -1;
        if (idx < 0) idx = moves.findIndex((m) => !m.trim());
        if (idx >= 0 && !moves.some((m) => norm(m) === norm(fix.addMove!))) {
          moves[idx] = fix.addMove;
          next.moves = moves;
        }
      }
      return next;
    });
    if (fix.nature || fix.evs || fix.ivs) {
      setNumeric((n) => {
        const out = { ...n };
        if (fix.evs) {
          out.evs = { ...n.evs };
          for (const k of STAT_ORDER) out.evs[k] = String(fix.evs![k as StatKey] ?? 0);
        }
        if (fix.ivs) {
          out.ivs = { ...n.ivs };
          for (const k of STAT_ORDER) {
            const v = fix.ivs[k as StatKey];
            if (v != null) out.ivs[k] = String(v);
          }
        }
        return out;
      });
    }
  };

  const handleSave = () => {
    const parsed = parseNumericForm(numeric);
    if (!parsed.ok) {
      setFieldError(parsed.message);
      return;
    }
    setFieldError(null);
    const committed = { ...local, level: parsed.level, ivs: parsed.ivs, evs: parsed.evs };
    onCommit(committed);
    onSave(committed);
  };

  const moveOptions = useMemo(() => {
    const names = new Set<string>();
    for (const m of species.moves) names.add(m.move.replace(/-/g, ' '));
    return [...names].sort();
  }, [species]);

  return (
    <div>
      <div className="pc-edit-head">
        <div className="pc-edit-portrait">
          <PokemonSprite
            dex={species.dex}
            name={species.name}
            size="md"
            variant={local.shiny ? 'shiny' : 'artwork'}
          />
        </div>
        <div className="pc-edit-head-info">
          <div className="pc-edit-title">
            {species.name}
            <span className="pc-edit-bst">BST {bst(species.baseStats)}</span>
          </div>
          <div className="pc-edit-chips">
            {species.types.map((t) => (
              <TypeChip key={t} t={t.toLowerCase()} />
            ))}
            <span className="font-mono-hud text-[12px] text-[var(--ink-2)] uppercase tracking-wider">
              Slot {draft.slot + 1}
            </span>
          </div>
          <div className="pc-edit-head-actions">
            <button
              type="button"
              className="chunky font-display text-[11px]"
              aria-pressed={local.shiny}
              style={{
                padding: '4px 10px',
                background: local.shiny ? 'var(--hud-accent)' : undefined,
                color: local.shiny ? '#100b06' : undefined,
              }}
              onClick={() => set('shiny', !local.shiny)}
              title="Toggle shiny - uses the shiny sprite (falls back to normal if missing)"
            >
              ✦ SHINY {local.shiny ? 'ON' : 'OFF'}
            </button>
            <button
              type="button"
              className="chunky ghost font-display text-[11px]"
              style={{ padding: '4px 10px' }}
              onClick={onViewDex}
              title={`Open the Pokédex entry for ${species.name}`}
            >
              POKÉDEX
            </button>
          </div>
        </div>
      </div>

      <CoachPanel
        review={activeReview}
        hidden={hiddenReview}
        metaLabel={metaLabel}
        hasIntel={!!intel}
        onApply={applyFix}
        onDismiss={(key) => onToggleDismiss(species.id, key)}
      />

      <label style={{ display: 'block', marginBottom: 8 }}>
        <span className="cell-label" style={{ display: 'block', marginBottom: 4 }}>Nickname (optional)</span>
        <input type="text" value={local.nickname} onChange={(e) => set('nickname', e.target.value)} style={{ width: '100%' }} />
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <label>
          Level
          <input
            type="text"
            inputMode="numeric"
            value={numeric.level}
            onChange={(e) => setNumeric((n) => ({ ...n, level: e.target.value }))}
            placeholder="1–100"
            style={{ width: '100%' }}
          />
        </label>
        <label>
          Gender
          <select value={local.gender} onChange={(e) => set('gender', e.target.value as PcGender)} style={{ width: '100%' }}>
            <option value="genderless">Genderless</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </label>
        <label>
          Nature
          <select value={local.nature} onChange={(e) => set('nature', e.target.value)} style={{ width: '100%' }}>
            {Object.keys(NATURES).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ability
          <select value={local.ability} onChange={(e) => set('ability', e.target.value)} style={{ width: '100%' }}>
            {species.abilities.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
            {species.hiddenAbilities.map((a) => (
              <option key={`h-${a}`} value={a}>
                {a} (H)
              </option>
            ))}
          </select>
        </label>
      </div>

      <label style={{ display: 'block', marginBottom: 12 }}>
        Held item
        <ItemSearchInput value={local.item} onChange={(v) => set('item', v)} items={items} />
      </label>

      <div className="section-head">IVs</div>
      <StatGridText values={numeric.ivs} onChange={(k, v) => setNumeric((n) => ({ ...n, ivs: { ...n.ivs, [k]: v } }))} />

      <div className="section-head" style={{ marginTop: 14, cursor: 'help' }} title={evTooltip}>
        EVs{' '}
        <span style={{ color: evTotal > 510 ? 'var(--danger)' : 'var(--fg-dim)', fontWeight: 400 }}>
          ({evTotal} / 510)
        </span>
      </div>
      <StatGridText values={numeric.evs} onChange={(k, v) => setNumeric((n) => ({ ...n, evs: { ...n.evs, [k]: v } }))} />

      {fieldError && (
        <p className="pc-field-error" role="alert">
          {fieldError}
        </p>
      )}

      {computed && (
        <div style={{ marginTop: 12 }}>
          <div className="section-head">Stats at Lv.{preview.level}</div>
          <div className="lens-v-stats">
            {(() => {
              const nat = NATURES[local.nature] || {};
              const maxStat = Math.max(1, ...STAT_ORDER.map((k) => computed[k]));
              return STAT_ORDER.map((k) => {
                const v = computed[k];
                const iv = preview.ivs[k] ?? 31;
                const ev = preview.evs[k] ?? 0;
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
              });
            })()}
          </div>
        </div>
      )}

      <div className="section-head" style={{ marginTop: 14 }}>
        Moves
      </div>
      {local.moves.map((mv, i) => (
        <label key={i} style={{ display: 'block', marginBottom: 6 }}>
          Move {i + 1}
          <input
            type="text"
            list="pc-move-list"
            value={mv}
            onChange={(e) => {
              const next = [...local.moves];
              next[i] = e.target.value;
              setLocal((d) => ({ ...d, moves: next }));
            }}
            style={{ width: '100%' }}
          />
        </label>
      ))}
      <datalist id="pc-move-list">
        {moveOptions.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>

      <label style={{ display: 'block', marginTop: 10 }}>
        Notes
        <textarea
          value={local.notes}
          onChange={(e) => set('notes', e.target.value)}
          rows={2}
          style={{ width: '100%', resize: 'vertical' }}
        />
      </label>

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary" onClick={handleSave}>
          Save to PC
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        {onDelete && (
          <button type="button" className="btn btn-danger btn-sm" style={{ marginLeft: 'auto' }} onClick={onDelete}>
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

const READINESS_STYLE: Record<Exclude<Readiness, 'unknown'>, { color: string; title: string }> = {
  ready: { color: '#7cd87b', title: 'Competitively ready - matches the meta' },
  minor: { color: 'var(--hud-accent)', title: 'Minor tweaks suggested - open to review' },
  heavy: { color: 'var(--hud-danger)', title: 'Needs work - off-meta set, open to review' },
};

/** Compact key for the readiness dots, shown above the box grid. */
function ReadinessLegend() {
  const items: { level: Exclude<Readiness, 'unknown'>; label: string }[] = [
    { level: 'ready', label: 'ready' },
    { level: 'minor', label: 'tweaks' },
    { level: 'heavy', label: 'rework' },
  ];
  return (
    <div
      className="flex items-center gap-2 mono"
      style={{ fontSize: 10, color: 'var(--fg-dim)' }}
      title="Competitive readiness vs Smogon usage - open a Pokémon for the full set review"
    >
      {items.map(({ level, label }) => (
        <span key={level} className="inline-flex items-center gap-1">
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: READINESS_STYLE[level].color,
              display: 'inline-block',
            }}
          />
          {label}
        </span>
      ))}
    </div>
  );
}

/** Subtle corner dot showing how competitively ready a stored mon is. */
function ReadinessDot({ level }: { level?: Readiness }) {
  if (!level || level === 'unknown') return null;
  const s = READINESS_STYLE[level];
  return (
    <span
      className="cell-readiness"
      title={s.title}
      aria-label={s.title}
      style={{
        position: 'absolute',
        bottom: 4,
        right: 4,
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: s.color,
        boxShadow: `0 0 4px ${s.color}`,
        opacity: 0.85,
        pointerEvents: 'none',
      }}
    />
  );
}

const SEVERITY_STYLE: Record<OptSeverity, { dot: string; label: string }> = {
  high: { dot: 'var(--hud-danger)', label: 'FIX' },
  medium: { dot: 'var(--hud-accent)', label: 'TIP' },
  low: { dot: 'var(--ink-2)', label: 'NOTE' },
};

/**
 * Coaching panel: shows where the stored set diverges from ladder usage and
 * offers a one-click fix per finding. Silent when there's no usage data; a clean
 * "looks meta-standard" note when the set already matches.
 */
function CoachPanel({
  review,
  hidden,
  metaLabel,
  hasIntel,
  onApply,
  onDismiss,
}: {
  review: OptSuggestion[];
  /** Tips dismissed for this species - hidden from the main list but restorable. */
  hidden: OptSuggestion[];
  metaLabel: string | null;
  hasIntel: boolean;
  onApply: (s: OptSuggestion) => void;
  onDismiss: (key: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [showHidden, setShowHidden] = useState(false);
  if (!hasIntel) return null;
  return (
    <div className="mono-panel p-3 rounded-[10px]" style={{ marginBottom: 12 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 font-mono-hud text-[13px] uppercase tracking-widest text-[var(--hud-accent-2)]"
        aria-expanded={open}
        style={{ marginBottom: open ? 8 : 0 }}
      >
        <span style={{ display: 'inline-block', width: 10 }}>{open ? '▾' : '▸'}</span>
        <span className="hud-mark">
          SET REVIEW{metaLabel ? <span className="text-[var(--ink-2)]"> · vs {metaLabel} usage</span> : null}
        </span>
        <span
          className="ml-auto font-mono-hud text-[11px] px-1.5 py-0.5 rounded-[4px]"
          style={{
            background: review.length === 0 ? 'rgba(124,216,123,0.15)' : 'rgba(255,255,255,0.06)',
            color: review.length === 0 ? '#7cd87b' : 'var(--ink-2)',
          }}
        >
          {review.length === 0 ? 'OK' : review.length}
        </span>
      </button>
      {!open ? null : review.length === 0 ? (
        <p className="font-mono-hud text-[13px] m-0" style={{ color: '#7cd87b' }}>
          ✓ This set looks meta-standard - nothing to flag.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {review.map((s, i) => {
            const sev = SEVERITY_STYLE[s.severity];
            const fixLabel =
              s.fix?.addMove && s.fix?.replaceMove
                ? `Swap in ${s.fix.addMove}`
                : s.fix?.addMove
                  ? `Add ${s.fix.addMove}`
                  : s.fix?.evs
                    ? 'Use spread'
                    : s.fix?.ivs
                      ? 'Fix IV'
                      : s.fix?.nature
                        ? `Use ${s.fix.nature}`
                        : s.fix?.item
                          ? `Use ${s.fix.item}`
                          : s.fix?.ability
                            ? `Use ${s.fix.ability}`
                            : null;
            return (
              <div
                key={i}
                className="flex items-start gap-2 px-2 py-1.5 rounded-[8px] border border-white/5 bg-white/[.03]"
              >
                <span
                  className="font-mono-hud text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] flex-shrink-0 mt-0.5"
                  style={{ background: sev.dot, color: '#100b06' }}
                  title={s.severity}
                >
                  {sev.label}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-[13px] font-semibold text-[var(--ink-0)]">{s.title}</div>
                  <div className="font-mono-hud text-[12px] text-[var(--ink-2)] leading-snug">{s.detail}</div>
                </div>
                {fixLabel && (
                  <button
                    type="button"
                    className="chunky ghost font-display text-[11px] flex-shrink-0"
                    style={{ padding: '4px 9px' }}
                    onClick={() => onApply(s)}
                    title={fixLabel}
                  >
                    {fixLabel}
                  </button>
                )}
                <button
                  type="button"
                  className="flex-shrink-0 mt-0.5 font-mono-hud text-[14px] leading-none text-[var(--ink-2)] hover:text-[var(--ink-0)] transition-colors"
                  style={{ padding: '2px 4px' }}
                  onClick={() => onDismiss(s.key)}
                  title="Dismiss - hide this tip for every copy of this species (e.g. a move your game can't teach)"
                  aria-label={`Dismiss: ${s.title}`}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
      {open && hidden.length > 0 && (
        <div style={{ marginTop: review.length === 0 ? 8 : 10 }}>
          <button
            type="button"
            onClick={() => setShowHidden((v) => !v)}
            className="font-mono-hud text-[11px] uppercase tracking-wider text-[var(--ink-2)] hover:text-[var(--ink-1)] transition-colors"
            aria-expanded={showHidden}
          >
            {showHidden ? '▾' : '▸'} {hidden.length} dismissed
          </button>
          {showHidden && (
            <div className="flex flex-col gap-1 mt-1.5">
              {hidden.map((s) => (
                <div
                  key={s.key}
                  className="flex items-center gap-2 px-2 py-1 rounded-[6px] border border-white/5 bg-white/[.02]"
                >
                  <span className="font-display text-[12px] text-[var(--ink-2)] line-through truncate flex-1 min-w-0">
                    {s.title}
                  </span>
                  <button
                    type="button"
                    className="chunky ghost font-display text-[11px] flex-shrink-0"
                    style={{ padding: '3px 8px' }}
                    onClick={() => onDismiss(s.key)}
                    title="Restore this tip"
                  >
                    ↺ Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatGridText({
  values,
  onChange,
}: {
  values: Record<(typeof STAT_ORDER)[number], string>;
  onChange: (k: (typeof STAT_ORDER)[number], v: string) => void;
}) {
  return (
    <div className="pc-stat-grid">
      {STAT_ORDER.map((k) => (
        <label key={k} className="pc-stat-field">
          {PLANNER_STAT_LABELS[k]}
          <input
            type="text"
            inputMode="numeric"
            value={values[k]}
            onChange={(e) => onChange(k, e.target.value)}
          />
        </label>
      ))}
    </div>
  );
}

const TR_TIER_STYLE: Record<TrPriorityEntry['tier'], { color: string; label: string }> = {
  high: { color: '#f2c14e', label: 'High' },
  medium: { color: '#7aa2d8', label: 'Med' },
  low: { color: 'var(--fg-dim)', label: 'Low' },
};

/**
 * Ranked list of taught moves (TMs and tutor moves) the mons in this box want but
 * don't run - prioritized by meta usage and saved-team membership.
 */
function TrPriorityPanel({ entries, hasMons }: { entries: TrPriorityEntry[]; hasMons: boolean }) {
  const [open, setOpen] = useState(true);
  const shown = entries.slice(0, 12);
  return (
    <div style={{ marginTop: 14 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="section-head"
        title="Taught moves (TM / tutor) your box mons want but don't run, ranked by ladder usage and team membership. ★ = the mon is on a saved team."
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          background: 'none',
          border: 0,
          padding: 0,
          cursor: 'pointer',
        }}
      >
        TM Priorities
        <span style={{ color: 'var(--fg-dim)', fontWeight: 400 }}>({entries.length})</span>
        <span style={{ marginLeft: 'auto', color: 'var(--fg-dim)', fontWeight: 400, fontSize: 11 }}>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open &&
        (entries.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--fg-dim)', margin: '4px 0 0' }}>
            {hasMons
              ? 'Every mon here already runs its standard taught moves.'
              : 'Add Pokémon to this box to see which TMs to chase.'}
          </p>
        ) : (
          <ol
            style={{
              listStyle: 'none',
              margin: '8px 0 0',
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            {shown.map((e, i) => {
              const ts = TR_TIER_STYLE[e.tier];
              return (
                <li
                  key={e.moveId}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                    padding: '6px 8px',
                    borderLeft: `3px solid ${ts.color}`,
                    background: 'rgba(255,255,255,0.02)',
                    borderRadius: 4,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="mono" style={{ color: 'var(--fg-dim)', fontSize: 11, minWidth: 16 }}>
                      {i + 1}
                    </span>
                    <strong style={{ fontSize: 13, color: 'var(--ink-0)' }}>{e.moveName}</strong>
                    <TypeChip t={e.type} />
                    <span className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)', textTransform: 'uppercase' }}>
                      {e.category}
                    </span>
                    <span className="mono" style={{ marginLeft: 'auto', fontSize: 11, color: ts.color }}>
                      {ts.label} · {Math.round(e.score)}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--fg-dim)', paddingLeft: 24 }}>
                    {e.wantedBy.map((w, j) => (
                      <span key={w.speciesId + j}>
                        {j > 0 && ' · '}
                        {w.speciesName} {w.moveUsagePct.toFixed(0)}%{w.onTeam ? ' ★' : ''}
                      </span>
                    ))}
                  </div>
                </li>
              );
            })}
            {entries.length > shown.length && (
              <li style={{ fontSize: 11, color: 'var(--fg-dim)', paddingLeft: 24 }}>
                +{entries.length - shown.length} more…
              </li>
            )}
          </ol>
        ))}
    </div>
  );
}

const TR_ASSIGN_TIER_STYLE: Record<TrAssignCandidate['tier'], { color: string; label: string }> = {
  high: { color: '#6fcf97', label: 'Best fit' },
  medium: { color: '#7aa2d8', label: 'Good fit' },
  low: { color: 'var(--fg-dim)', label: 'Coverage' },
};

/**
 * "I have this TM - who should I give it to?" Pick a move from the box's
 * teachable set and see the mons that can learn it, ranked by how much they want
 * it. The inverse of {@link TrPriorityPanel}.
 */
function TrAssignPanel({
  value,
  onChange,
  options,
  result,
  hasMons,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { id: string; name: string }[];
  result: TrAssignResult | null;
  hasMons: boolean;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ marginTop: 14 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="section-head"
        title="Have a TM in hand? Pick the move and see which mon in this box should learn it, ranked by ladder usage and saved-team membership."
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          background: 'none',
          border: 0,
          padding: 0,
          cursor: 'pointer',
        }}
      >
        Who gets this TM?
        <span style={{ marginLeft: 'auto', color: 'var(--fg-dim)', fontWeight: 400, fontSize: 11 }}>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <>
          <input
            type="text"
            list="tr-assign-moves"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={hasMons ? 'Type a move (e.g. Knock Off)…' : 'Add Pokémon to this box first'}
            disabled={!hasMons}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              marginTop: 8,
              padding: '6px 8px',
              fontSize: 13,
              background: 'var(--bg-2, rgba(255,255,255,0.04))',
              border: '1px solid var(--border, rgba(255,255,255,0.12))',
              borderRadius: 4,
              color: 'var(--ink-0)',
            }}
          />
          <datalist id="tr-assign-moves">
            {options.map((o) => (
              <option key={o.id} value={o.name} />
            ))}
          </datalist>

          {!value.trim() ? (
            <p style={{ fontSize: 12, color: 'var(--fg-dim)', margin: '8px 0 0' }}>
              {hasMons
                ? `Pick from ${options.length} ${options.length === 1 ? 'move' : 'moves'} the mons in this box can be taught.`
                : 'Add Pokémon to this box to match a TM to a recipient.'}
            </p>
          ) : !result ? (
            <p style={{ fontSize: 12, color: 'var(--fg-dim)', margin: '8px 0 0' }}>
              No move matching “{value.trim()}”. Pick one from the list.
            </p>
          ) : (
            <TrAssignResults result={result} />
          )}
        </>
      )}
    </div>
  );
}

function TrAssignResults({ result }: { result: TrAssignResult }) {
  if (result.candidates.length === 0) {
    return (
      <p style={{ fontSize: 12, color: 'var(--fg-dim)', margin: '8px 0 0' }}>
        {result.alreadyKnow.length > 0
          ? `${result.alreadyKnow.map((m) => m.nickname || m.speciesName).join(', ')} already ${
              result.alreadyKnow.length === 1 ? 'runs' : 'run'
            } ${result.moveName}. No mon here needs the record.`
          : `Nothing in this box can be taught ${result.moveName}.`}
      </p>
    );
  }
  return (
    <>
      <ol
        style={{
          listStyle: 'none',
          margin: '8px 0 0',
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {result.candidates.map((c, i) => {
          const ts = TR_ASSIGN_TIER_STYLE[c.tier];
          return (
            <li
              key={`${c.slot}-${c.speciesId}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
                padding: '6px 8px',
                borderLeft: `3px solid ${ts.color}`,
                background: 'rgba(255,255,255,0.02)',
                borderRadius: 4,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="mono" style={{ color: 'var(--fg-dim)', fontSize: 11, minWidth: 16 }}>
                  {i + 1}
                </span>
                <strong style={{ fontSize: 13, color: 'var(--ink-0)' }}>
                  {c.nickname || c.speciesName}
                </strong>
                {c.nickname && (
                  <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{c.speciesName}</span>
                )}
                {c.onTeam && <span title="On a saved team">★</span>}
                <span className="mono" style={{ marginLeft: 'auto', fontSize: 11, color: ts.color }}>
                  {ts.label} · {Math.round(c.score)}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--fg-dim)', paddingLeft: 24 }}>
                Box slot {c.slot + 1} · {c.reason}
              </div>
            </li>
          );
        })}
      </ol>
      {(result.alreadyKnow.length > 0 || result.cannotLearnCount > 0) && (
        <p style={{ fontSize: 11, color: 'var(--fg-dim)', margin: '6px 0 0', paddingLeft: 24 }}>
          {result.alreadyKnow.length > 0 &&
            `${result.alreadyKnow.length} already ${result.alreadyKnow.length === 1 ? 'runs' : 'run'} it`}
          {result.alreadyKnow.length > 0 && result.cannotLearnCount > 0 && ' · '}
          {result.cannotLearnCount > 0 && `${result.cannotLearnCount} can't learn it`}
        </p>
      )}
    </>
  );
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

