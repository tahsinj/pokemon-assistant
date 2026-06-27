import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Move, Pokemon } from '../lib/types';
import type { SmogonBundle } from '../lib/smogon';
import { DexDetailModal } from '../components/DexDetailModal';
import type { PcBoxSummary, PcPokemonRecord, PcGender, SavePcPokemonPayload } from '../lib/bridgeTypes';
import { SpeciesList } from '../components/SpeciesList';
import { PokemonSprite } from '../components/PokemonSprite';
import { ModuleFrame, SectionHead } from '../components/hud/ModuleFrame';
import { TypeChip } from '../components/hud/HudPrimitives';
import { GenderIcon } from '../components/GenderIcon';
import { ItemSearchInput } from '../components/ItemSearchInput';
import type { HeldItem } from '../lib/types';
import { NATURES, calcAllStats, STAT_LABELS as PLANNER_STAT_LABELS } from '../lib/stats';
import { buildSpeciesFuse } from '../lib/fuzzySpecies';
import {
  DEFAULT_IVS,
  ZERO_EVS,
  PC_POKEMON_DRAG_TYPE,
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

type EditorMode = 'closed' | 'pick-species' | 'edit';

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
  const bridge = typeof window !== 'undefined' ? window.cobblemon : undefined;
  const hasPc = !!bridge?.pcBoxesList;
  const [dexSpecies, setDexSpecies] = useState<Pokemon | null>(null);

  const [boxes, setBoxes] = useState<PcBoxSummary[]>([]);
  const [activeBoxId, setActiveBoxId] = useState<string | null>(null);
  const [occupants, setOccupants] = useState<PcPokemonRecord[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [editor, setEditor] = useState<EditorDraft>(emptyDraft(0));
  const [editorMode, setEditorMode] = useState<EditorMode>('closed');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [paste, setPaste] = useState('');
  const [newBoxName, setNewBoxName] = useState('');
  const [renamingBox, setRenamingBox] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [tabRenameDraft, setTabRenameDraft] = useState('');
  const [boxCounts, setBoxCounts] = useState<Record<string, number>>({});
  const [hasLastExport, setHasLastExport] = useState(false);
  const [dragOver, setDragOver] = useState<{ boxId: string; slot?: number } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const suppressClickRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pokemonById = useMemo(() => {
    const m: Record<string, Pokemon> = {};
    for (const p of pokemon) m[p.id] = p;
    return m;
  }, [pokemon]);

  const speciesFuse = useMemo(() => buildSpeciesFuse(pokemon), [pokemon]);

  const activeBox = boxes.find((b) => b.id === activeBoxId) ?? null;

  const slotMap = useMemo(() => {
    const m = new Map<number, PcPokemonRecord>();
    for (const p of occupants) m.set(p.slot, p);
    return m;
  }, [occupants]);

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
  }, [bridge, activeBoxId]);

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
    setEditorMode('edit');
    setStatusMsg(null);
  };

  const clearDragUi = () => {
    setDragOver(null);
    setDraggingId(null);
  };

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
    [bridge, activeBoxId, editor.id, refreshBoxes, refreshPokemon],
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
    setEditorMode('closed');
    setSelectedSlot(null);
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
      <ModuleFrame kicker="◢ PC STORAGE" title="PC Storage" subtitle="desktop app required">
        <p className="font-mono-hud text-[15px] text-[var(--ink-2)] m-0">
          PC storage requires the desktop app (Electron). Run with <code>npm run dev</code>.
        </p>
      </ModuleFrame>
    );
  }

  return (
    <ModuleFrame
      kicker="◢ PC STORAGE"
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
                title="Double-click to rename"
                className={[
                  'box-tab',
                  b.id === activeBoxId ? 'box-tab-active' : '',
                  dragOver?.boxId === b.id && dragOver.slot === undefined ? 'pc-drag-over' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => {
                  setActiveBoxId(b.id);
                  setEditorMode('closed');
                  setSelectedSlot(null);
                }}
                onDoubleClick={() => {
                  setTabRenameDraft(b.name);
                  setRenamingTabId(b.id);
                }}
                onDragOver={(e) => {
                  const payload = readDragPayload(e.dataTransfer);
                  if (!payload) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setDragOver({ boxId: b.id });
                }}
                onDragLeave={() => {
                  setDragOver((prev) => (prev?.boxId === b.id && prev.slot === undefined ? null : prev));
                }}
                onDrop={async (e) => {
                  e.preventDefault();
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
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
              {occupants.length} / {PC_SLOTS_PER_BOX}
            </span>
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
                    mon ? openExisting(mon) : openEmptySlot(slot);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      mon ? openExisting(mon) : openEmptySlot(slot);
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

          {editorMode === 'edit' && editor.species && (
            <PcEditor
              draft={editor}
              species={editor.species}
              items={items}
              onViewDex={() => editor.species && setDexSpecies(editor.species)}
              onCommit={setEditor}
              onSave={(committed) => void saveDraft(committed)}
              onCancel={() => setEditorMode('closed')}
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
  onViewDex,
  onCommit,
  onSave,
  onCancel,
  onDelete,
}: {
  draft: EditorDraft;
  species: Pokemon;
  items: HeldItem[];
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
  }, [draftKey]);

  const set = <K extends keyof EditorDraft>(key: K, val: EditorDraft[K]) => setLocal((d) => ({ ...d, [key]: val }));

  const preview = previewNumericForm(numeric, { level: draft.level, ivs: draft.ivs, evs: draft.evs });
  const computed = calcAllStats(species.baseStats, preview.ivs, preview.evs, preview.level, local.nature);
  const evTotal = evTotalFromForm(numeric);

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <h3 className="font-display text-[17px] font-bold m-0 text-[var(--ink-0)]">{species.name}</h3>
        {species.types.map((t) => (
          <TypeChip key={t} t={t.toLowerCase()} />
        ))}
        <span className="font-mono-hud text-[13px] text-[var(--ink-2)] uppercase tracking-wider">
          Slot {draft.slot + 1}
        </span>
        <button
          type="button"
          className="chunky font-display text-[11px]"
          aria-pressed={local.shiny}
          style={{
            padding: '4px 10px',
            marginLeft: 'auto',
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
          ◢ VIEW IN POKÉDEX
        </button>
      </div>

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

      <div className="section-head" style={{ marginTop: 14 }}>
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
        <div style={{ marginTop: 12, fontSize: 12 }}>
          <div className="section-head">Stats at Lv.{preview.level}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            {STAT_ORDER.map((k) => (
              <span key={k} className="mono">
                {PLANNER_STAT_LABELS[k]} {computed[k]}
              </span>
            ))}
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

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

