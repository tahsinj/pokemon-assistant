import { useMemo } from 'react';
import { usePersistentState } from '../lib/usePersistentState';
import type { BaseStats, Pokemon, StatKey } from '../lib/types';
import { NATURES } from '../lib/stats';
import {
  GENDER_RATIOS,
  STAT_KEYS,
  abilityDistribution,
  ivTargetProbability,
  natureDistribution,
  perfectCountDistribution,
  perStat31Probability,
  type BreedingItem,
  type BreedingIvConfig,
  type StatTarget,
} from '../lib/breeding';
import { ModuleFrame, SectionHead } from '../components/hud/ModuleFrame';
import { TypeChip } from '../components/hud/HudPrimitives';
import { PokemonSprite } from '../components/PokemonSprite';
import { abilityName } from '../lib/displayNames';

const ITEMS: { id: BreedingItem; label: string }[] = [
  { id: 'none', label: 'No item' },
  { id: 'destiny-knot', label: 'Destiny Knot' },
  { id: 'everstone', label: 'Everstone' },
  { id: 'power-hp', label: 'Power Weight (HP)' },
  { id: 'power-atk', label: 'Power Bracer (Atk)' },
  { id: 'power-def', label: 'Power Belt (Def)' },
  { id: 'power-spa', label: 'Power Lens (SpA)' },
  { id: 'power-spd', label: 'Power Band (SpD)' },
  { id: 'power-spe', label: 'Power Anklet (Spe)' },
];

const STAT_TARGETS: { id: StatTarget; label: string }[] = [
  { id: 'any', label: 'Any' },
  { id: '31', label: '31' },
  { id: 'ge30', label: '30+' },
  { id: '0', label: '0' },
];

const IVS_31: BaseStats = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const IVS_0: BaseStats = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

interface ParentState {
  speciesName: string;
  item: BreedingItem;
  nature: string;
  ability: string;
  ivs: BaseStats;
}

const emptyParent = (): ParentState => ({
  speciesName: '',
  item: 'none',
  nature: 'Hardy',
  ability: '',
  ivs: { ...IVS_31 },
});

function pct(p: number): string {
  if (p <= 0) return '0%';
  if (p >= 0.9995) return '100%';
  if (p < 0.0001) return `${(p * 100).toExponential(1)}%`;
  return `${(p * 100).toFixed(p < 0.01 ? 2 : 1)}%`;
}

function oneIn(p: number): string {
  if (p <= 0) return 'never';
  if (p >= 0.995) return 'every egg';
  return `1 in ${Math.round(1 / p).toLocaleString()}`;
}

/** Eggs needed for >=90% chance of at least one hit. */
function eggsFor90(p: number): string {
  if (p <= 0) return '-';
  if (p >= 0.9) return '1';
  return Math.ceil(Math.log(0.1) / Math.log(1 - p)).toLocaleString();
}

export function BreedingPage({ pokemon }: { pokemon: Pokemon[] }) {
  const pokemonByName = useMemo(() => {
    const m: Record<string, Pokemon> = {};
    for (const p of pokemon) m[p.name.toLowerCase()] = p;
    return m;
  }, [pokemon]);

  // Persisted so a full form of parent/target input survives navigating away
  // and back (every tab unmounts on switch) - see usePersistentState.
  const [female, setFemale] = usePersistentState<ParentState>('breeding:female', emptyParent);
  const [male, setMale] = usePersistentState<ParentState>('breeding:male', emptyParent);
  const [genderRatioIdx, setGenderRatioIdx] = usePersistentState('breeding:genderRatioIdx', 0);

  // Reverse target
  const [targetStats, setTargetStats] = usePersistentState<Record<StatKey, StatTarget>>(
    'breeding:targetStats',
    { hp: '31', atk: '31', def: '31', spa: '31', spd: '31', spe: 'any' },
  );
  const [targetNature, setTargetNature] = usePersistentState('breeding:targetNature', '');
  const [targetAbility, setTargetAbility] = usePersistentState('breeding:targetAbility', '');
  const [targetGender, setTargetGender] = usePersistentState<'' | 'male' | 'female'>(
    'breeding:targetGender',
    '',
  );

  const femaleSpecies = pokemonByName[female.speciesName.toLowerCase()];
  const maleSpecies = pokemonByName[male.speciesName.toLowerCase()];

  const ivConfig: BreedingIvConfig = useMemo(
    () => ({
      femaleIvs: female.ivs,
      maleIvs: male.ivs,
      femaleItem: female.item,
      maleItem: male.item,
    }),
    [female.ivs, male.ivs, female.item, male.item],
  );

  const countDist = useMemo(() => perfectCountDistribution(ivConfig), [ivConfig]);
  const perStat = useMemo(() => perStat31Probability(ivConfig), [ivConfig]);
  const atLeast = (k: number) => countDist.slice(k).reduce((a, b) => a + b, 0);

  const natures = useMemo(
    () => natureDistribution(female.item, male.item, female.nature, male.nature),
    [female.item, male.item, female.nature, male.nature],
  );

  const abilities = useMemo(
    () => (femaleSpecies && female.ability ? abilityDistribution(femaleSpecies, female.ability) : null),
    [femaleSpecies, female.ability],
  );

  // Offspring gender ratio comes from the female species (offspring = mother's
  // line). pokemon.json carries maleRatio (-1 = genderless) via fetch-gender;
  // the manual selector only kicks in when species data is missing.
  const speciesMaleP: number | null | undefined =
    femaleSpecies && typeof femaleSpecies.maleRatio === 'number'
      ? femaleSpecies.maleRatio === -1
        ? null
        : femaleSpecies.maleRatio
      : undefined;
  const maleP = speciesMaleP !== undefined ? speciesMaleP : GENDER_RATIOS[genderRatioIdx].maleP;

  // Egg-group compatibility (Ditto pairs with anything breedable).
  const compatibility = useMemo(() => {
    if (!femaleSpecies || !maleSpecies) return null;
    const f = femaleSpecies.eggGroups.map((g) => g.toLowerCase());
    const m = maleSpecies.eggGroups.map((g) => g.toLowerCase());
    const isDitto = (s: Pokemon, gs: string[]) => s.name === 'Ditto' || gs.includes('ditto');
    if (f.includes('undiscovered') || m.includes('undiscovered')) return { ok: false, why: 'Undiscovered egg group' };
    if (isDitto(femaleSpecies, f) || isDitto(maleSpecies, m)) return { ok: true, why: 'Ditto pair' };
    const shared = f.filter((g) => m.includes(g));
    return shared.length
      ? { ok: true, why: `shared group: ${shared.join(', ')}` }
      : { ok: false, why: 'no shared egg group' };
  }, [femaleSpecies, maleSpecies]);

  // ----- Reverse target probability -----
  const targetIvP = useMemo(() => ivTargetProbability(ivConfig, targetStats), [ivConfig, targetStats]);
  const targetNatureP = useMemo(() => {
    if (!targetNature) return 1;
    return natures.reduce(
      (acc, o) => acc + (o.nature === targetNature ? o.p : o.nature === 'random' ? o.p / 25 : 0),
      0,
    );
  }, [natures, targetNature]);
  const targetAbilityP = useMemo(() => {
    if (!targetAbility) return 1;
    if (!abilities) return 0;
    return abilities.find((a) => a.ability === targetAbility)?.p ?? 0;
  }, [abilities, targetAbility]);
  const targetGenderP =
    targetGender === ''
      ? 1
      : maleP === null
        ? 0
        : targetGender === 'male'
          ? maleP
          : 1 - maleP;
  const targetP = targetIvP * targetNatureP * targetAbilityP * targetGenderP;

  const slots = female.item === 'destiny-knot' || male.item === 'destiny-knot' ? 5 : 3;

  return (
    <ModuleFrame
      subtitle={`${slots} IVs inherited${natures[0].nature !== 'random' ? ' · nature locked' : ' · nature random'} · exact odds per egg`}
      side={
        <div className="mono-panel px-3 py-1 rounded-full font-mono-hud text-[14px] text-accent-2">
          5×31+ · {pct(atLeast(5))}
        </div>
      }
    >
      <div className="flex flex-col gap-4 hud-form">
        <div className="grid grid-cols-[1fr,1fr,1.25fr] gap-4 items-start">
          <ParentPanel
            label="PARENT ♀"
            tone="#ffa6c8"
            parent={female}
            onChange={setFemale}
            species={femaleSpecies}
            pokemon={pokemon}
            showAbility
            note="With Ditto: enter the non-Ditto parent here - it sets species & ability."
          />
          <ParentPanel
            label="PARENT ♂ / DITTO"
            tone="#5ea7ff"
            parent={male}
            onChange={setMale}
            species={maleSpecies}
            pokemon={pokemon}
          />

          {/* Outcomes */}
          <div className="flex flex-col gap-3 min-w-0">
            <div className="mono-panel p-3 rounded-[10px]">
              <div className="flex items-center justify-between">
                <SectionHead label="EGG OUTCOMES" extra="per egg" />
                {compatibility && (
                  <span
                    className="font-mono-hud text-[12px] uppercase tracking-wider px-2 py-0.5 rounded-full"
                    style={{
                      background: 'rgba(0,0,0,.5)',
                      color: compatibility.ok ? '#7cd87b' : 'var(--hud-danger)',
                    }}
                    title={compatibility.why}
                  >
                    {compatibility.ok ? '✓ compatible' : '✗ incompatible'}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                {[
                  { label: '6×31 perfect', p: countDist[6] },
                  { label: '≥5×31', p: atLeast(5) },
                  { label: '≥4×31', p: atLeast(4) },
                  { label: '≥3×31', p: atLeast(3) },
                ].map((row) => (
                  <div key={row.label} className="grid grid-cols-[72px,1fr,140px] items-center gap-2">
                    <span className="font-mono-hud text-[14px] text-ink-1 uppercase">{row.label}</span>
                    <div className="relative h-[10px] rounded-full bg-black/40 overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{
                          width: `${Math.max(row.p > 0 ? 1.5 : 0, row.p * 100)}%`,
                          background: 'linear-gradient(90deg,var(--hud-accent),var(--hud-accent-2))',
                        }}
                      />
                    </div>
                    <span className="font-mono-hud text-[14px] text-right text-ink-0">
                      {pct(row.p)} <span className="text-ink-2">· {oneIn(row.p)}</span>
                    </span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-6 gap-1.5 mt-3">
                {STAT_KEYS.map((k) => (
                  <div key={k} className="flex flex-col items-center gap-0.5 px-1 py-1 rounded-[8px] bg-black/30 border border-white/5">
                    <span className="font-mono-hud text-[12px] uppercase text-ink-2">{k}</span>
                    <span
                      className="font-mono-hud text-[14px]"
                      style={{ color: perStat[k] >= 0.999 ? '#7cd87b' : 'var(--ink-0)' }}
                      title={`P(${k} = 31)`}
                    >
                      {pct(perStat[k])}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mono-panel p-3 rounded-[10px]">
              <SectionHead label="NATURE · ABILITY · GENDER" />
              <div className="flex flex-col gap-1 font-mono-hud text-[14px] text-ink-1">
                <div>
                  NATURE ·{' '}
                  {natures.map((o, i) => (
                    <span key={i} className="text-ink-0">
                      {i > 0 && ' / '}
                      {o.nature === 'random' ? 'random (1/25 each)' : `${o.nature} ${pct(o.p)}`}
                    </span>
                  ))}
                </div>
                <div>
                  ABILITY ·{' '}
                  {abilities ? (
                    abilities.map((a, i) => (
                      <span key={a.ability} style={{ color: a.hidden ? 'var(--hud-accent)' : 'var(--ink-0)' }}>
                        {i > 0 && ' / '}
                        {abilityName(a.ability)}
                        {a.hidden ? ' (HA)' : ''} {pct(a.p)}
                      </span>
                    ))
                  ) : (
                    <span className="text-ink-2">set ♀ species + ability</span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  GENDER ·
                  {speciesMaleP !== undefined ? (
                    <span className="text-ink-0">
                      {speciesMaleP === null
                        ? 'genderless'
                        : `♂ ${pct(speciesMaleP)} · ♀ ${pct(1 - speciesMaleP)}`}{' '}
                      <span className="text-ink-2">({femaleSpecies!.name} data)</span>
                    </span>
                  ) : (
                    <>
                      <select
                        value={genderRatioIdx}
                        onChange={(e) => setGenderRatioIdx(Number(e.target.value))}
                        aria-label="Species gender ratio"
                      >
                        {GENDER_RATIOS.map((r, i) => (
                          <option key={r.label} value={i}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      <span className="text-ink-2">(set ♀ species for exact data)</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Reverse target builder */}
        <div className="mono-panel p-3 rounded-[10px]">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <SectionHead label="TARGET EGG" extra="set a goal, get the odds" />
            <div className="font-mono-hud text-[15px]">
              <span style={{ color: targetP > 0 ? 'var(--hud-accent-2)' : 'var(--hud-danger)' }}>
                {pct(targetP)}
              </span>{' '}
              <span className="text-ink-2">
                · {oneIn(targetP)} · {eggsFor90(targetP)} eggs for 90% odds
              </span>
            </div>
          </div>
          <div className="grid grid-cols-[1fr,auto] gap-4 items-start mt-1">
            <div className="grid grid-cols-6 gap-2">
              {STAT_KEYS.map((k) => (
                <label key={k} className="flex flex-col gap-1 items-stretch">
                  <span className="font-mono-hud text-[12px] uppercase tracking-wider text-ink-2 text-center">
                    {k}
                  </span>
                  <select
                    value={targetStats[k]}
                    onChange={(e) => setTargetStats((t) => ({ ...t, [k]: e.target.value as StatTarget }))}
                    aria-label={`${k} target`}
                  >
                    {STAT_TARGETS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 justify-between">
                <span className="font-mono-hud text-[12px] uppercase tracking-wider text-ink-2">Nature</span>
                <select value={targetNature} onChange={(e) => setTargetNature(e.target.value)}>
                  <option value="">Any</option>
                  {Object.keys(NATURES).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 justify-between">
                <span className="font-mono-hud text-[12px] uppercase tracking-wider text-ink-2">Ability</span>
                <select value={targetAbility} onChange={(e) => setTargetAbility(e.target.value)} disabled={!femaleSpecies}>
                  <option value="">Any</option>
                  {femaleSpecies &&
                    [...femaleSpecies.abilities, ...femaleSpecies.hiddenAbilities.filter((h) => !femaleSpecies.abilities.includes(h))].map(
                      (a) => (
                        <option key={a} value={a}>
                          {abilityName(a)}
                          {femaleSpecies.hiddenAbilities.includes(a) ? ' (HA)' : ''}
                        </option>
                      ),
                    )}
                </select>
              </label>
              <label className="flex items-center gap-2 justify-between">
                <span className="font-mono-hud text-[12px] uppercase tracking-wider text-ink-2">Gender</span>
                <select value={targetGender} onChange={(e) => setTargetGender(e.target.value as '' | 'male' | 'female')}>
                  <option value="">Any</option>
                  <option value="male">♂ Male</option>
                  <option value="female">♀ Female</option>
                </select>
              </label>
            </div>
          </div>
          {targetAbility && abilities && (targetAbilityP === 0 || !abilities.some((a) => a.ability === targetAbility)) && (
            <div className="font-mono-hud text-[13px] mt-2" style={{ color: 'var(--hud-danger)' }}>
              ⚠ {targetAbility} is unreachable from the ♀ parent's current ability - a hidden ability needs an HA mother.
            </div>
          )}
        </div>
      </div>
    </ModuleFrame>
  );
}

function ParentPanel({
  label,
  tone,
  parent,
  onChange,
  species,
  pokemon,
  showAbility,
  note,
}: {
  label: string;
  tone: string;
  parent: ParentState;
  onChange: (p: ParentState) => void;
  species: Pokemon | undefined;
  pokemon: Pokemon[];
  showAbility?: boolean;
  note?: string;
}) {
  const set = <K extends keyof ParentState>(k: K, v: ParentState[K]) => onChange({ ...parent, [k]: v });
  const setIv = (k: StatKey, v: number) =>
    onChange({ ...parent, ivs: { ...parent.ivs, [k]: Math.max(0, Math.min(31, Number.isFinite(v) ? v : 0)) } });
  const datalistId = `breed-species-${label.replace(/[^a-z]/gi, '')}`;
  const perfectCount = STAT_KEYS.filter((k) => parent.ivs[k] === 31).length;

  return (
    <div className="mono-panel p-3 rounded-[10px]">
      <div className="flex items-center justify-between mb-2">
        <span className="hud-mark font-mono-hud text-[14px] uppercase tracking-widest" style={{ color: tone }}>
          {label}
        </span>
        <span className="font-mono-hud text-[12px] text-ink-2 uppercase">{perfectCount}×31</span>
      </div>

      <div className="flex items-center gap-2 mb-2">
        {species && <PokemonSprite dex={species.dex} name={species.name} size="sm" />}
        <input
          list={datalistId}
          value={parent.speciesName}
          onChange={(e) => set('speciesName', e.target.value)}
          placeholder="Species…"
          className="flex-1 min-w-0"
          aria-label={`${label} species`}
        />
        <datalist id={datalistId}>
          {pokemon.map((p) => (
            <option key={p.id} value={p.name} />
          ))}
        </datalist>
      </div>
      {species && (
        <div className="flex items-center gap-1.5 mb-2">
          {species.types.map((t) => (
            <TypeChip key={t} t={t.toLowerCase()} />
          ))}
          <span className="font-mono-hud text-[12px] text-ink-2 uppercase">
            {species.eggGroups.join(' · ') || 'no egg groups'}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mb-2">
        <label className="flex flex-col gap-1">
          <span className="font-mono-hud text-[12px] uppercase tracking-wider text-ink-2">Held item</span>
          <select value={parent.item} onChange={(e) => set('item', e.target.value as BreedingItem)}>
            {ITEMS.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono-hud text-[12px] uppercase tracking-wider text-ink-2">Nature</span>
          <select value={parent.nature} onChange={(e) => set('nature', e.target.value)}>
            {Object.keys(NATURES).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      {showAbility && (
        <label className="flex flex-col gap-1 mb-2">
          <span className="font-mono-hud text-[12px] uppercase tracking-wider text-ink-2">Ability</span>
          <select
            value={parent.ability}
            onChange={(e) => set('ability', e.target.value)}
            disabled={!species}
          >
            <option value="">{species ? 'Pick ability…' : 'Pick species first'}</option>
            {species &&
              [...species.abilities, ...species.hiddenAbilities.filter((h) => !species.abilities.includes(h))].map((a) => (
                <option key={a} value={a}>
                  {abilityName(a)}
                  {species.hiddenAbilities.includes(a) ? ' (HA)' : ''}
                </option>
              ))}
          </select>
        </label>
      )}

      <div className="flex items-center justify-between mb-1">
        <span className="font-mono-hud text-[12px] uppercase tracking-wider text-ink-2">IVs</span>
        <div className="flex gap-1">
          <button
            type="button"
            className="chunky ghost font-display text-[12px]"
            style={{ padding: '2px 8px' }}
            onClick={() => onChange({ ...parent, ivs: { ...IVS_31 } })}
          >
            ALL 31
          </button>
          <button
            type="button"
            className="chunky ghost font-display text-[12px]"
            style={{ padding: '2px 8px' }}
            onClick={() => onChange({ ...parent, ivs: { ...IVS_0 } })}
          >
            ALL 0
          </button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {STAT_KEYS.map((k) => (
          <label key={k} className="flex items-center gap-1.5">
            <span className="font-mono-hud text-[12px] uppercase text-ink-2 w-7">{k}</span>
            <input
              type="number"
              min={0}
              max={31}
              value={parent.ivs[k]}
              onChange={(e) => setIv(k, Number(e.target.value))}
              className="w-full"
              style={{
                color: parent.ivs[k] === 31 ? '#7cd87b' : parent.ivs[k] === 0 ? 'var(--hud-danger)' : undefined,
              }}
              aria-label={`${label} ${k} IV`}
            />
          </label>
        ))}
      </div>

      {note && <div className="text-[13px] text-ink-2 mt-2 leading-snug">{note}</div>}
    </div>
  );
}
