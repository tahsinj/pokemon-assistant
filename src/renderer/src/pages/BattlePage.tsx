import { useEffect, useMemo, useState } from 'react';
import type { BaseStats, Move, Pokemon, StatKey } from '../lib/types';
import {
  EMPTY_FIELD,
  NEUTRAL_EVS,
  NEUTRAL_IVS,
  type FieldSpec,
  type BattlePokemonSpec,
  type Weather,
  type Terrain,
} from '../lib/battle/types';
import { calcAllMoves, type DamageOutcome } from '../lib/battle/damage';
import { parseShowdownTeam, type ParsedShowdownMon } from '../lib/showdownTeam';
import { buildSpeciesFuse, resolveSpeciesName } from '../lib/fuzzySpecies';
import { NATURES } from '../lib/stats';
import { TYPES } from '../lib/typechart';
import { ItemSearchInput } from '../components/ItemSearchInput';
import type { HeldItem } from '../lib/types';
import { PokemonSprite } from '../components/PokemonSprite';
import { suggestMoveset } from '../lib/recommender';
import { dexForSpeciesName } from '../lib/pokemonSprite';
import { usePcCollection } from '../lib/usePcCollection';
import { fromPcRecord, fromTeamMember, toCombatFields, type CombatImportInput } from '../lib/toCombatSpec';
import { getTeamDraft } from '../lib/teamDraft';
import { ModuleFrame, SectionHead, SpriteFrame } from '../components/hud/ModuleFrame';
import { TypeChip } from '../components/hud/HudPrimitives';

type StatusCode = '' | 'brn' | 'par' | 'psn' | 'tox' | 'slp' | 'frz';

interface CombatSpec {
  speciesName: string; // display name, e.g. "Garchomp"
  level: number;
  nature: string;
  ability: string;
  item: string;
  teraType: string; // capitalized, e.g. "Steel"
  isTera: boolean;
  ivs: BaseStats;
  evs: BaseStats;
  moves: [string, string, string, string];
  currentHPPercent: number;
  status: StatusCode;
  boosts: Partial<Record<StatKey, number>>;
}

const ALL_TERA_TYPES = ['', ...TYPES.map((t) => t[0].toUpperCase() + t.slice(1))];
const STATUSES: { id: StatusCode; label: string }[] = [
  { id: '', label: 'Healthy' },
  { id: 'brn', label: 'Burn' },
  { id: 'par', label: 'Paralyzed' },
  { id: 'psn', label: 'Poisoned' },
  { id: 'tox', label: 'Badly Poisoned' },
  { id: 'slp', label: 'Asleep' },
  { id: 'frz', label: 'Frozen' },
];

const WEATHERS: { id: Weather; label: string }[] = [
  { id: '', label: 'None' },
  { id: 'Sun', label: 'Sun' },
  { id: 'Rain', label: 'Rain' },
  { id: 'Sand', label: 'Sandstorm' },
  { id: 'Snow', label: 'Snow' },
  { id: 'Hail', label: 'Hail' },
  { id: 'Harsh Sunshine', label: 'Harsh Sunshine' },
  { id: 'Heavy Rain', label: 'Heavy Rain' },
  { id: 'Strong Winds', label: 'Strong Winds' },
];
const TERRAINS: { id: Terrain; label: string }[] = [
  { id: '', label: 'None' },
  { id: 'Electric', label: 'Electric' },
  { id: 'Grassy', label: 'Grassy' },
  { id: 'Misty', label: 'Misty' },
  { id: 'Psychic', label: 'Psychic' },
];

const BOOST_KEYS: StatKey[] = ['atk', 'def', 'spa', 'spd', 'spe'];

function emptySpec(speciesName = ''): CombatSpec {
  return {
    speciesName,
    level: 50,
    nature: 'Hardy',
    ability: '',
    item: '',
    teraType: '',
    isTera: false,
    ivs: { ...NEUTRAL_IVS },
    evs: { ...NEUTRAL_EVS },
    moves: ['', '', '', ''],
    currentHPPercent: 100,
    status: '',
    boosts: {},
  };
}

function toBattleSpec(c: CombatSpec): BattlePokemonSpec {
  return {
    speciesName: c.speciesName,
    level: c.level,
    nature: c.nature,
    ability: c.ability || undefined,
    item: c.item || undefined,
    teraType: c.teraType || undefined,
    isTerastallized: c.isTera && !!c.teraType,
    ivs: c.ivs,
    evs: c.evs,
    moves: c.moves.filter((m) => m.trim().length > 0).map((name) => ({ name })),
    currentHPPercent: c.currentHPPercent,
    status: c.status || undefined,
    boosts: c.boosts,
  };
}

function specFromParsed(
  block: ParsedShowdownMon,
  resolvedName: string,
  fallbackMoves: string[],
): CombatSpec {
  const base = emptySpec(resolvedName);
  base.level = block.level ?? 50;
  if (block.nature) base.nature = block.nature;
  if (block.ability) base.ability = block.ability;
  if (block.item) base.item = block.item;
  base.evs = { ...NEUTRAL_EVS, ...(block.evs as Partial<BaseStats>) };
  base.ivs = { ...NEUTRAL_IVS, ...(block.ivs as Partial<BaseStats>) };
  const moves = block.moves.slice(0, 4);
  while (moves.length < 4) moves.push(fallbackMoves[moves.length] ?? '');
  base.moves = [moves[0] ?? '', moves[1] ?? '', moves[2] ?? '', moves[3] ?? ''];
  return base;
}

function nHKOText(d: DamageOutcome): string {
  if (d.error) return 'err';
  if (d.isZero) return '-';
  if (d.ko.text) return d.ko.text;
  if (d.ko.chance >= 1) return `${d.ko.n}HKO`;
  return `${d.ko.n}HKO ${(d.ko.chance * 100).toFixed(0)}%`;
}

function rangeText(d: DamageOutcome): string {
  if (d.error) return d.error;
  if (d.isZero) return '0 dmg';
  return `${d.pctMin.toFixed(1)}–${d.pctMax.toFixed(1)}%`;
}

export function BattlePage({
  pokemon,
  moves,
  items,
}: {
  pokemon: Pokemon[];
  moves: Record<string, Move>;
  items: HeldItem[];
}) {
  const pokemonByName = useMemo(() => {
    const m: Record<string, Pokemon> = {};
    for (const p of pokemon) m[p.name.toLowerCase()] = p;
    return m;
  }, [pokemon]);

  const movesByName = useMemo(() => {
    const m: Record<string, Move> = {};
    for (const mv of Object.values(moves)) m[mv.name.toLowerCase()] = mv;
    return m;
  }, [moves]);

  const fuse = useMemo(() => buildSpeciesFuse(pokemon), [pokemon]);

  const pokemonById = useMemo(() => {
    const m: Record<string, Pokemon> = {};
    for (const p of pokemon) m[p.id] = p;
    return m;
  }, [pokemon]);

  const [paste, setPaste] = useState('');
  const [parseMsg, setParseMsg] = useState<string | null>(null);
  const [team, setTeam] = useState<(CombatSpec | null)[]>([null, null, null, null, null, null]);
  const [activeSlot, setActiveSlot] = useState(0);

  // Import sources beyond the Showdown paste.
  const pc = usePcCollection();
  const [showPcPicker, setShowPcPicker] = useState(false);
  const [savedTeams, setSavedTeams] = useState<{ id: string; name: string }[]>([]);
  const bridge = typeof window !== 'undefined' ? window.cobblemon : undefined;
  useEffect(() => {
    if (!bridge?.teamsList) return;
    bridge
      .teamsList()
      .then((rows) => setSavedTeams(rows.map((r) => ({ id: r.id, name: r.name }))))
      .catch(() => setSavedTeams([]));
  }, [bridge]);

  const [opponent, setOpponent] = useState<CombatSpec>(emptySpec());
  const [field, setField] = useState<FieldSpec>(EMPTY_FIELD);

  const setSlot = (idx: number, c: CombatSpec | null) => {
    const next = [...team];
    next[idx] = c;
    setTeam(next);
  };

  // Live damage rows for every team member's moves vs the opponent.
  const opponentSpec = useMemo(() => toBattleSpec(opponent), [opponent]);
  const teamSpecs = useMemo(() => team.map((c) => (c ? toBattleSpec(c) : null)), [team]);

  const opponentReady = opponent.speciesName.trim().length > 0;
  const opponentSpecies = pokemonByName[opponent.speciesName.toLowerCase()];

  const teamDamage = useMemo(() => {
    if (!opponentReady) return [];
    return teamSpecs.map((s, i) => {
      if (!s) return { idx: i, outcomes: [] as DamageOutcome[] };
      const outcomes = calcAllMoves(9, s, opponentSpec, field);
      return { idx: i, outcomes };
    });
  }, [teamSpecs, opponentSpec, opponentReady, field]);

  const activeSpec = teamSpecs[activeSlot];
  const reverseFieldSwap: FieldSpec = useMemo(
    () => ({
      ...field,
      attackerSide: field.defenderSide,
      defenderSide: field.attackerSide,
    }),
    [field],
  );
  const reverseDamage = useMemo(() => {
    if (!opponentReady || !activeSpec) return [] as DamageOutcome[];
    return calcAllMoves(9, opponentSpec, activeSpec, reverseFieldSwap);
  }, [opponentSpec, activeSpec, reverseFieldSwap, opponentReady]);

  const onImportPaste = () => {
    setParseMsg(null);
    const parsed = parseShowdownTeam(paste);
    if (!parsed.length) {
      setParseMsg('No Pokémon blocks found. Paste a Showdown export (blank line between species).');
      return;
    }
    const next: (CombatSpec | null)[] = [null, null, null, null, null, null];
    const misses: string[] = [];
    parsed.forEach((block, i) => {
      if (i >= 6) return;
      const species = resolveSpeciesName(fuse, block.species);
      if (!species) {
        misses.push(block.species);
        return;
      }
      const fallback = suggestMoveset(species, moves).map((s) => s.move.name);
      next[i] = specFromParsed(block, species.name, fallback);
    });
    setTeam(next);
    if (misses.length) {
      setParseMsg(`Loaded ${parsed.length - misses.length}/${parsed.length}. Unmatched: ${misses.join(', ')}`);
    } else {
      setParseMsg(`Imported ${parsed.length} Pokémon.`);
    }
  };

  const specFromImport = (input: CombatImportInput): CombatSpec | null => {
    const species =
      (input.speciesId && pokemonById[input.speciesId]) ||
      pokemonByName[input.speciesDisplay.toLowerCase()] ||
      resolveSpeciesName(fuse, input.speciesDisplay);
    if (!species) return null;
    const fallback = suggestMoveset(species, moves).map((s) => s.move.name);
    return { ...emptySpec(species.name), ...toCombatFields(input, species, fallback) };
  };

  const importOne = (input: CombatImportInput) => {
    const spec = specFromImport(input);
    if (!spec) return;
    const empty = team.findIndex((s) => s === null);
    const idx = empty >= 0 ? empty : activeSlot;
    setSlot(idx, spec);
    setParseMsg(`Loaded ${spec.speciesName} into slot ${idx + 1}.`);
  };

  const importMany = (inputs: CombatImportInput[], label: string) => {
    const next: (CombatSpec | null)[] = [null, null, null, null, null, null];
    let count = 0;
    inputs.slice(0, 6).forEach((input, i) => {
      const spec = specFromImport(input);
      if (spec) {
        next[i] = spec;
        count++;
      }
    });
    setTeam(next);
    setParseMsg(`Loaded ${count} Pokémon from ${label}.`);
  };

  const onImportSavedTeam = async (id: string) => {
    if (!bridge?.teamsLoad) return;
    const rec = await bridge.teamsLoad(id);
    if (!rec) return;
    importMany(
      rec.members.filter((m) => m.speciesId).map((m) => fromTeamMember(m)),
      `“${rec.name}”`,
    );
  };

  const onImportBuilderDraft = () => {
    const draft = getTeamDraft().filter((d): d is NonNullable<typeof d> => !!d);
    if (!draft.length) {
      setParseMsg('Team Builder has no squad in progress.');
      return;
    }
    importMany(
      draft.map((d) =>
        fromTeamMember({
          slot: 0,
          speciesId: d.speciesId,
          speciesDisplay: pokemonById[d.speciesId]?.name ?? d.speciesId,
          item: d.detail?.item ?? null,
          ability: d.detail?.ability ?? null,
          nature: d.detail?.nature ?? null,
          level: d.detail?.level ?? null,
          evs: d.detail?.evs ?? null,
          moves: d.detail?.moves ?? null,
        }),
      ),
      'Team Builder',
    );
  };

  const fillSlotFromSpecies = (idx: number, name: string) => {
    const species = pokemonByName[name.toLowerCase()];
    if (!species) return;
    const spec = emptySpec(species.name);
    const learnset = suggestMoveset(species, moves);
    spec.moves = [0, 1, 2, 3].map(
      (i) => learnset[i]?.move?.name ?? '',
    ) as CombatSpec['moves'];
    spec.ability = species.abilities[0] ?? '';
    setSlot(idx, spec);
  };

  const evsLine = (evs: BaseStats) =>
    `${evs.hp}/${evs.atk}/${evs.def}/${evs.spa}/${evs.spd}/${evs.spe}`;

  return (
    <ModuleFrame
      kicker="◢ BATTLE ASSISTANT"
      title="Damage Calc"
      subtitle={
        opponentReady
          ? `vs ${opponent.speciesName} · LV ${opponent.level}${field.weather ? ` · ${field.weather}` : ''}`
          : 'Pick an opponent and field'
      }
      side={
        opponentReady && (
          <div className="flex items-center gap-2 mono-panel px-3 py-1 rounded-full font-mono-hud text-[14px] text-[var(--ink-1)]">
            <span
              className="w-2 h-2 rounded-full bg-[var(--hud-danger)]"
              style={{ boxShadow: '0 0 8px var(--hud-danger)' }}
            />
            OPP. HP {opponent.currentHPPercent}%
          </div>
        )
      }
    >
      <div className="flex flex-col gap-4 hud-form">
        <div className="grid grid-cols-2 gap-4">
          <CombatPanel
            title="Opponent"
            spec={opponent}
            onChange={setOpponent}
            pokemonByName={pokemonByName}
            pokemon={pokemon}
            moves={moves}
            items={items}
          />
          <FieldPanel field={field} onChange={setField} />
        </div>

        {/* Your team */}
        <div className="mono-panel p-3 rounded-[10px]">
          <SectionHead label="YOUR TEAM" extra="paste a Showdown export or fill slots by species" />
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder={
              'Paste a Showdown export…\n\nGarchomp @ Choice Band\nAbility: Rough Skin\nEVs: 4 HP / 252 Atk / 252 Spe\nJolly Nature\n- Earthquake\n- Outrage\n- Stone Edge\n- Iron Head'
            }
            rows={6}
            className="w-full mb-2"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              className="chunky font-display text-[12px]"
              style={{ '--c': 'var(--hud-accent-2)', padding: '6px 12px' } as React.CSSProperties}
              onClick={onImportPaste}
            >
              IMPORT PASTE
            </button>
            <button
              type="button"
              className="chunky ghost font-display text-[12px]"
              style={{ padding: '6px 12px' }}
              onClick={() => setTeam([null, null, null, null, null, null])}
            >
              CLEAR TEAM
            </button>
            {pc.available && (
              <button
                type="button"
                className="chunky ghost font-display text-[12px]"
                style={{ padding: '6px 12px' }}
                onClick={() => setShowPcPicker((v) => !v)}
                aria-expanded={showPcPicker}
              >
                FROM PC · {pc.mons.length}
              </button>
            )}
            {savedTeams.length > 0 && (
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) void onImportSavedTeam(e.target.value);
                }}
                className="bg-black/40 border border-white/15 rounded-full px-2.5 py-1 font-mono-hud text-[12px] uppercase tracking-wider text-[var(--ink-1)] outline-none focus:border-[var(--hud-accent-2)]"
              >
                <option value="">From saved team…</option>
                {savedTeams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              className="chunky ghost font-display text-[12px]"
              style={{ padding: '6px 12px' }}
              onClick={onImportBuilderDraft}
              disabled={getTeamDraft().every((d) => d === null)}
            >
              FROM BUILDER
            </button>
            {parseMsg && (
              <span className="font-mono-hud text-[14px] text-[var(--ink-2)]">› {parseMsg}</span>
            )}
          </div>
          {showPcPicker && pc.available && (
            <div className="mt-2 max-h-[200px] overflow-y-auto pr-1 no-scrollbar flex flex-col gap-1">
              {pc.mons.length === 0 ? (
                <div className="font-mono-hud text-[13px] text-[var(--ink-2)] py-3 text-center">
                  {pc.loading ? 'Loading PC…' : 'No Pokémon stored in the PC yet.'}
                </div>
              ) : (
                pc.mons.map((rec) => {
                  const sp = pokemonById[rec.speciesId];
                  if (!sp) return null;
                  return (
                    <button
                      key={rec.id}
                      type="button"
                      onClick={() => importOne(fromPcRecord(rec))}
                      title="Click to load into the next empty slot"
                      className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-[10px] border border-white/10 bg-white/[.04] text-left hover:border-[var(--hud-accent-2)] transition"
                    >
                      <PokemonSprite dex={sp.dex} name={sp.name} size="xs" />
                      <span className="font-display text-[13px] font-semibold flex-1 min-w-0 truncate text-[var(--ink-0)]">
                        {rec.nickname || sp.name}
                      </span>
                      <span className="font-mono-hud text-[12px] text-[var(--ink-1)] flex-shrink-0">
                        Lv {rec.level}
                      </span>
                      <span className="font-mono-hud text-[11px] uppercase tracking-wider text-[var(--ink-2)] flex-shrink-0">
                        {pc.boxNameById[rec.boxId] ?? 'Box'}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          )}
          <div className="grid grid-cols-6 gap-2 mt-3">
            {team.map((slot, i) => (
              <SlotChip
                key={i}
                idx={i}
                slot={slot}
                active={activeSlot === i}
                pokemon={pokemon}
                onActivate={() => setActiveSlot(i)}
                onPick={(name) => fillSlotFromSpecies(i, name)}
                onClear={() => setSlot(i, null)}
              />
            ))}
          </div>
        </div>

        {!opponentReady && (
          <div className="font-mono-hud text-[15px] text-[var(--ink-2)] text-center py-4">
            Pick an opponent species above to see damage calculations.
          </div>
        )}

        {/* Damage matrix - design BattleModule layout */}
        {opponentReady && (
          <div className="grid grid-cols-[200px,1fr] gap-5">
            {/* Opponent holo card */}
            <div>
              {opponentSpecies ? (
                <SpriteFrame
                  dex={opponentSpecies.dex}
                  name={opponentSpecies.name}
                  corner="TARGET"
                  cornerColor="var(--hud-danger)"
                />
              ) : (
                <div className="sprite-frame rounded-[14px] aspect-square flex items-center justify-center font-mono-hud text-[15px] text-[var(--ink-2)]">
                  UNKNOWN SPECIES
                </div>
              )}
              <div className="font-display text-[15px] font-bold mt-2 text-[var(--ink-0)]">
                {opponent.speciesName}
              </div>
              {opponentSpecies && (
                <div className="flex gap-1 mt-1">
                  {opponentSpecies.types.map((t) => (
                    <TypeChip key={t} t={t.toLowerCase()} />
                  ))}
                </div>
              )}
              <div className="mono-panel mt-2 p-2 rounded-[8px] font-mono-hud text-[14px] text-[var(--ink-1)] leading-relaxed">
                ABL · {(opponent.ability || opponentSpecies?.abilities[0] || '?').toUpperCase()}
                <br />
                ITM · {(opponent.item || 'none').toUpperCase()}
                <br />
                EVS · {evsLine(opponent.evs)}
              </div>
            </div>

            {/* Per-member damage rows */}
            <div className="flex flex-col gap-4 min-w-0">
              <div>
                <SectionHead
                  label={`YOUR MOVES → ${opponent.speciesName.toUpperCase()}`}
                  extra={`${opponent.currentHPPercent}% HP`}
                />
                {team.every((s) => !s) ? (
                  <div className="font-mono-hud text-[14px] text-[var(--ink-2)] py-3">
                    Add at least one team member to see damage rows.
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {teamDamage.map(({ idx, outcomes }) => {
                      const slot = team[idx];
                      if (!slot) return null;
                      const sorted = [...outcomes]
                        .map((o, i) => ({ o, i }))
                        .sort((a, b) => {
                          const ka = a.o.ko.chance + a.o.pctMax / 1000;
                          const kb = b.o.ko.chance + b.o.pctMax / 1000;
                          return kb - ka;
                        });
                      return (
                        <div
                          key={idx}
                          className={`rounded-[12px] border p-3 ${
                            activeSlot === idx
                              ? 'border-[var(--hud-accent)]/60 bg-white/[.05]'
                              : 'border-white/10 bg-white/[.03]'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 mb-2">
                            <span className="font-display text-[15px] font-bold text-[var(--ink-0)]">
                              {slot.speciesName}
                            </span>
                            <span className="font-mono-hud text-[13px] text-[var(--ink-2)] uppercase">
                              L{slot.level} {slot.nature}
                              {slot.item ? ` · ${slot.item}` : ''}
                              {slot.ability ? ` · ${slot.ability}` : ''}
                            </span>
                            <button
                              type="button"
                              onClick={() => setActiveSlot(idx)}
                              className={`ml-auto chunky font-display text-[11px] ${activeSlot === idx ? '' : 'ghost'}`}
                              style={{ padding: '3px 10px' }}
                            >
                              {activeSlot === idx ? 'ACTIVE' : 'MAKE ACTIVE'}
                            </button>
                          </div>
                          {outcomes.length === 0 ? (
                            <div className="font-mono-hud text-[13px] text-[var(--ink-2)]">
                              No moves configured.
                            </div>
                          ) : (
                            <div className="flex flex-col gap-2">
                              {sorted.map(({ o, i }) => (
                                <DamageRow
                                  key={`${o.moveName}-${i}`}
                                  d={o}
                                  moveType={movesByName[o.moveName.toLowerCase()]?.type}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Reverse threat */}
              {activeSpec && team[activeSlot] && (
                <div>
                  <SectionHead
                    label={`${opponent.speciesName.toUpperCase()} → ${team[activeSlot]!.speciesName.toUpperCase()}`}
                    extra={`${team[activeSlot]!.currentHPPercent}% HP`}
                  />
                  {reverseDamage.length === 0 ? (
                    <div className="font-mono-hud text-[14px] text-[var(--ink-2)] py-2">
                      Add moves to the opponent above to see what they might hit you with.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {reverseDamage.map((o, i) => (
                        <DamageRow
                          key={`${o.moveName}-${i}`}
                          d={o}
                          moveType={movesByName[o.moveName.toLowerCase()]?.type}
                          danger
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </ModuleFrame>
  );
}

/** Design BattleModule damage row: name+chip · PWR · roll bar · range/KO. */
function DamageRow({ d, moveType, danger }: { d: DamageOutcome; moveType?: string; danger?: boolean }) {
  const pct = Math.min(100, d.pctMax);
  const ohko = !d.isZero && !d.error && d.ko.n === 1 && d.ko.chance >= 1;
  const nearOhko = !d.isZero && !d.error && d.ko.n === 1;
  const barBg = ohko
    ? 'linear-gradient(90deg,#ff5b6c,#ffb84d)'
    : danger
      ? 'linear-gradient(90deg,#ff5b6c,var(--hud-accent))'
      : pct >= 50
        ? 'linear-gradient(90deg,var(--hud-accent),var(--hud-accent-2))'
        : 'linear-gradient(90deg,#5ea7ff,var(--hud-accent-2))';
  const valueColor = ohko
    ? 'var(--hud-danger)'
    : nearOhko
      ? '#ffb84d'
      : d.isZero || d.error
        ? 'var(--ink-2)'
        : '#fff';
  return (
    <div
      className="grid grid-cols-[minmax(0,1.2fr),90px,1fr,150px] items-center gap-3 px-3 py-2 rounded-[10px] border border-white/10 bg-white/[.04]"
      title={d.desc}
    >
      <div className="font-display text-[15px] font-semibold flex items-center gap-2 min-w-0 text-[var(--ink-0)]">
        <span className="truncate">{d.moveName}</span>
        {moveType && <TypeChip t={moveType.toLowerCase()} />}
      </div>
      <div className="font-mono-hud text-[14px] text-[var(--ink-2)]">
        {d.category[0]} · {d.basePower || '-'}
      </div>
      <div className="relative h-[14px] rounded-[4px] bg-black/40 overflow-hidden">
        {!d.isZero && !d.error && (
          <div
            className="absolute inset-y-0 left-0 rounded-[3px]"
            style={{
              width: `${pct}%`,
              background: barBg,
              boxShadow: `0 0 8px ${ohko ? '#ff5b6c' : 'var(--hud-accent-2)'}`,
            }}
          />
        )}
      </div>
      <div className="font-mono-hud text-[14px] text-right" style={{ color: valueColor }}>
        {rangeText(d)} · {nHKOText(d)}
      </div>
    </div>
  );
}

function SlotChip({
  idx,
  slot,
  active,
  pokemon,
  onActivate,
  onPick,
  onClear,
}: {
  idx: number;
  slot: CombatSpec | null;
  active: boolean;
  pokemon: Pokemon[];
  onActivate: () => void;
  onPick: (name: string) => void;
  onClear: () => void;
}) {
  const [text, setText] = useState('');
  const datalistId = `species-slot-${idx}`;
  return (
    <div
      onClick={onActivate}
      className={`relative rounded-[12px] border p-2 min-h-[92px] flex flex-col items-center justify-center gap-1 text-center cursor-pointer transition group ${
        active
          ? 'border-[var(--hud-accent)] bg-[rgba(255,198,54,.06)]'
          : 'border-white/10 bg-white/[.03] hover:bg-white/[.06]'
      }`}
    >
      {slot ? (
        <>
          {(() => {
            const dex = dexForSpeciesName(pokemon, slot.speciesName);
            return dex ? <PokemonSprite dex={dex} name={slot.speciesName} size="xs" /> : null;
          })()}
          <span className="font-display text-[13px] font-bold leading-tight text-[var(--ink-0)]">
            {slot.speciesName}
          </span>
          <span className="font-mono-hud text-[11px] text-[var(--ink-2)] uppercase">
            L{slot.level} · {slot.nature}
          </span>
          <span className="font-mono-hud text-[11px] text-[var(--ink-2)] leading-tight line-clamp-2">
            {slot.moves.filter(Boolean).join(', ') || 'no moves'}
          </span>
          <button
            type="button"
            aria-label={`Clear slot ${idx + 1}`}
            className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/50 border border-white/15 text-[var(--ink-1)] hover:text-white font-mono-hud text-[12px] leading-none opacity-0 group-hover:opacity-100 transition"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
          >
            ×
          </button>
        </>
      ) : (
        <>
          <span className="font-mono-hud text-[12px] uppercase tracking-widest text-[var(--ink-2)]">
            Slot {idx + 1}
          </span>
          <input
            list={datalistId}
            placeholder="Species…"
            value={text}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && text.trim()) {
                onPick(text.trim());
                setText('');
              }
            }}
            onBlur={() => {
              if (text.trim()) {
                onPick(text.trim());
                setText('');
              }
            }}
            className="w-full text-center"
            style={{ fontSize: 13, padding: '3px 8px' }}
          />
          <datalist id={datalistId}>
            {pokemon.map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>
        </>
      )}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono-hud text-[12px] uppercase tracking-wider text-[var(--ink-2)]">
      {children}
    </span>
  );
}

function CombatPanel({
  title,
  spec,
  onChange,
  pokemonByName,
  pokemon,
  moves,
  items,
}: {
  title: string;
  spec: CombatSpec;
  onChange: (next: CombatSpec) => void;
  pokemonByName: Record<string, Pokemon>;
  pokemon: Pokemon[];
  moves: Record<string, Move>;
  items: HeldItem[];
}) {
  const species = pokemonByName[spec.speciesName.toLowerCase()];
  const learnsetNames = useMemo(() => {
    if (!species) return [] as string[];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const lm of species.moves) {
      const mv = moves[lm.move];
      if (mv && !seen.has(mv.id)) {
        seen.add(mv.id);
        out.push(mv.name);
      }
    }
    return out;
  }, [species, moves]);

  const update = <K extends keyof CombatSpec>(k: K, v: CombatSpec[K]) => onChange({ ...spec, [k]: v });
  const setMove = (i: number, name: string) => {
    const next = [...spec.moves] as CombatSpec['moves'];
    next[i] = name;
    onChange({ ...spec, moves: next });
  };
  const setEv = (k: StatKey, v: number) => {
    const clamped = Math.max(0, Math.min(252, Number.isFinite(v) ? v : 0));
    onChange({ ...spec, evs: { ...spec.evs, [k]: clamped } });
  };
  const setBoost = (k: StatKey, v: number) => {
    const clamped = Math.max(-6, Math.min(6, Number.isFinite(v) ? v : 0));
    onChange({ ...spec, boosts: { ...spec.boosts, [k]: clamped } });
  };

  return (
    <div className="mono-panel p-3 rounded-[10px]">
      <SectionHead label={title.toUpperCase()} />
      <div className="grid grid-cols-[2fr,1fr] gap-2 mb-2">
        <label className="flex flex-col gap-1">
          <FieldLabel>Species</FieldLabel>
          <input
            list={`species-${title}`}
            value={spec.speciesName}
            onChange={(e) => {
              const v = e.target.value;
              const hit = pokemonByName[v.toLowerCase()];
              onChange({ ...spec, speciesName: hit ? hit.name : v });
            }}
            placeholder="e.g. Garchomp"
          />
          <datalist id={`species-${title}`}>
            {pokemon.map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-1">
          <FieldLabel>Level</FieldLabel>
          <input
            type="number"
            min={1}
            max={100}
            value={spec.level}
            onChange={(e) => update('level', Number(e.target.value) || 1)}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <label className="flex flex-col gap-1">
          <FieldLabel>Ability</FieldLabel>
          <input
            list={`abil-${title}`}
            value={spec.ability}
            onChange={(e) => update('ability', e.target.value)}
            placeholder={species?.abilities[0] || ''}
          />
          {species && (
            <datalist id={`abil-${title}`}>
              {[...species.abilities, ...species.hiddenAbilities].map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          )}
        </label>
        <label className="flex flex-col gap-1">
          <FieldLabel>Held item</FieldLabel>
          <ItemSearchInput value={spec.item} onChange={(v) => update('item', v)} items={items} />
        </label>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-2">
        <label className="flex flex-col gap-1">
          <FieldLabel>Nature</FieldLabel>
          <select value={spec.nature} onChange={(e) => update('nature', e.target.value)}>
            {Object.keys(NATURES).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <FieldLabel>Status</FieldLabel>
          <select value={spec.status} onChange={(e) => update('status', e.target.value as StatusCode)}>
            {STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <FieldLabel>HP %</FieldLabel>
          <input
            type="number"
            min={1}
            max={100}
            value={spec.currentHPPercent}
            onChange={(e) => update('currentHPPercent', Math.max(1, Math.min(100, Number(e.target.value) || 100)))}
          />
        </label>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-2 items-end">
        <label className="flex flex-col gap-1">
          <FieldLabel>Tera</FieldLabel>
          <select value={spec.teraType} onChange={(e) => update('teraType', e.target.value)}>
            {ALL_TERA_TYPES.map((t) => (
              <option key={t || 'none'} value={t}>
                {t || '-'}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-1">
          <input
            type="checkbox"
            checked={spec.isTera}
            onChange={(e) => update('isTera', e.target.checked)}
            disabled={!spec.teraType}
          />
          Terastallized
        </label>
        <div />
      </div>

      <SectionHead label="EVS" />
      <div className="grid grid-cols-6 gap-1.5 mb-2">
        {(['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as StatKey[]).map((k) => (
          <label key={k} className="flex flex-col gap-1">
            <FieldLabel>{k}</FieldLabel>
            <input
              type="number"
              min={0}
              max={252}
              step={4}
              value={spec.evs[k]}
              onChange={(e) => setEv(k, Number(e.target.value))}
              className="w-full"
            />
          </label>
        ))}
      </div>

      <SectionHead label="BOOSTS" extra="stages" />
      <div className="grid grid-cols-5 gap-1.5 mb-2">
        {BOOST_KEYS.map((k) => (
          <label key={k} className="flex flex-col gap-1">
            <FieldLabel>{k}</FieldLabel>
            <input
              type="number"
              min={-6}
              max={6}
              value={spec.boosts[k] ?? 0}
              onChange={(e) => setBoost(k, Number(e.target.value))}
              className="w-full"
            />
          </label>
        ))}
      </div>

      <SectionHead label="MOVES" />
      <div className="grid grid-cols-2 gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <label key={i} className="flex flex-col gap-1">
            <FieldLabel>Move {i + 1}</FieldLabel>
            <input
              list={`moves-${title}-${i}`}
              value={spec.moves[i]}
              onChange={(e) => setMove(i, e.target.value)}
              placeholder="e.g. Earthquake"
            />
            {learnsetNames.length > 0 && (
              <datalist id={`moves-${title}-${i}`}>
                {learnsetNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            )}
          </label>
        ))}
      </div>

      {species && (
        <div className="mt-2 flex items-center gap-1.5 font-mono-hud text-[13px] text-[var(--ink-2)]">
          {species.types.map((t) => (
            <TypeChip key={t} t={t.toLowerCase()} />
          ))}
          <span>· BST {Object.values(species.baseStats).reduce((a, b) => a + b, 0)}</span>
        </div>
      )}
    </div>
  );
}

function FieldPanel({ field, onChange }: { field: FieldSpec; onChange: (f: FieldSpec) => void }) {
  const update = <K extends keyof FieldSpec>(k: K, v: FieldSpec[K]) => onChange({ ...field, [k]: v });
  const setSide = (side: 'attackerSide' | 'defenderSide', patch: Partial<FieldSpec['attackerSide']>) =>
    onChange({ ...field, [side]: { ...field[side], ...patch } });

  return (
    <div className="mono-panel p-3 rounded-[10px]">
      <SectionHead label="FIELD" />
      <div className="grid grid-cols-2 gap-2 mb-2">
        <label className="flex flex-col gap-1">
          <FieldLabel>Weather</FieldLabel>
          <select value={field.weather} onChange={(e) => update('weather', e.target.value as Weather)}>
            {WEATHERS.map((w) => (
              <option key={w.id || 'none'} value={w.id}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <FieldLabel>Terrain</FieldLabel>
          <select value={field.terrain} onChange={(e) => update('terrain', e.target.value as Terrain)}>
            {TERRAINS.map((t) => (
              <option key={t.id || 'none'} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex items-center gap-2 mb-3">
        <input type="checkbox" checked={field.isGravity} onChange={(e) => update('isGravity', e.target.checked)} />
        Gravity active
      </label>

      <div className="grid grid-cols-2 gap-3">
        <SidePanel
          label="Your side"
          side={field.attackerSide}
          onChange={(patch) => setSide('attackerSide', patch)}
        />
        <SidePanel
          label="Opponent side"
          side={field.defenderSide}
          onChange={(patch) => setSide('defenderSide', patch)}
        />
      </div>
    </div>
  );
}

function SidePanel({
  label,
  side,
  onChange,
}: {
  label: string;
  side: FieldSpec['attackerSide'];
  onChange: (patch: Partial<FieldSpec['attackerSide']>) => void;
}) {
  return (
    <div>
      <div className="font-mono-hud text-[13px] uppercase tracking-widest text-[var(--ink-2)] mb-1.5">
        {label}
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-2">
          Spikes
          <select
            value={side.spikes}
            onChange={(e) => onChange({ spikes: Number(e.target.value) as 0 | 1 | 2 | 3 })}
          >
            <option value={0}>0</option>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={side.stealthRock}
            onChange={(e) => onChange({ stealthRock: e.target.checked })}
          />
          Stealth Rock
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={side.steelsurge}
            onChange={(e) => onChange({ steelsurge: e.target.checked })}
          />
          Steelsurge
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={side.isReflect} onChange={(e) => onChange({ isReflect: e.target.checked })} />
          Reflect
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={side.isLightScreen}
            onChange={(e) => onChange({ isLightScreen: e.target.checked })}
          />
          Light Screen
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={side.isAuroraVeil}
            onChange={(e) => onChange({ isAuroraVeil: e.target.checked })}
          />
          Aurora Veil
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={side.isTailwind}
            onChange={(e) => onChange({ isTailwind: e.target.checked })}
          />
          Tailwind
        </label>
      </div>
    </div>
  );
}
