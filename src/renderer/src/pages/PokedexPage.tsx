import { useMemo, useState } from 'react';
import type { Pokemon, Move } from '../lib/types';
import type { SmogonBundle } from '../lib/smogon';
import { SpeciesList } from '../components/SpeciesList';
import { ModuleFrame } from '../components/hud/ModuleFrame';
import { TypeChip } from '../components/hud/HudPrimitives';
import { PokemonDexDetail } from '../components/PokemonDexDetail';
import { useFormat } from '../lib/formats';

export function PokedexPage({
  pokemon,
  moves,
  smogon,
}: { pokemon: Pokemon[]; moves: Record<string, Move>; smogon: SmogonBundle | null }) {
  const format = useFormat();
  const [selected, setSelected] = useState<Pokemon | null>(pokemon[0] || null);
  const pokemonById = useMemo(() => {
    const m: Record<string, Pokemon> = {};
    for (const p of pokemon) m[p.id] = p;
    return m;
  }, [pokemon]);
  return (
    <ModuleFrame
      kicker="POKÉDEX"
      title="Field Index"
      subtitle={`${pokemon.length} species · ${format.label}`}
      side={
        selected && (
          <div className="flex gap-1.5">
            {selected.types.map((t) => (
              <TypeChip key={t} t={t.toLowerCase()} size="md" />
            ))}
          </div>
        )
      }
    >
      <div className="grid grid-cols-[minmax(280px,380px),1fr] gap-5 items-start">
        <div className="h-[62vh] min-h-[320px] overflow-hidden">
          <SpeciesList pokemon={pokemon} selectedId={selected?.id} onSelect={setSelected} />
        </div>
        <div className="min-w-0">
          {selected && (
            <PokemonDexDetail
              p={selected}
              moves={moves}
              smogon={smogon}
              allPokemon={pokemon}
              onSelectSpecies={(id) => {
                const next = pokemonById[id];
                if (next) setSelected(next);
              }}
            />
          )}
        </div>
      </div>
    </ModuleFrame>
  );
}
