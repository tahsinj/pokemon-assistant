import { useEffect, useMemo, useState } from 'react';
import type { Move, Pokemon } from '../lib/types';
import type { SmogonBundle } from '../lib/smogon';
import { PokemonDexDetail } from './PokemonDexDetail';
import { TypeChip } from './hud/HudPrimitives';

/**
 * Overlay that shows the full Pokédex detail panel for a species, openable from
 * anywhere that has a Pokémon (e.g. a PC box slot). Keeps its own selected
 * species so the teammate / checks chips can navigate within the modal. Closes
 * on Escape or backdrop click.
 */
export function DexDetailModal({
  species,
  pokemonById,
  moves,
  smogon,
  onClose,
}: {
  species: Pokemon;
  pokemonById: Record<string, Pokemon>;
  moves: Record<string, Move>;
  smogon: SmogonBundle | null;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState<Pokemon>(species);

  // Re-seed when opened for a different species.
  useEffect(() => {
    setCurrent(species);
  }, [species]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const title = useMemo(() => current.name.toUpperCase(), [current]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${title} Pokédex`}
        className="relative z-[1] w-[min(1040px,94vw)] max-h-[90vh] overflow-hidden rounded-[18px] border border-[var(--hairline)] bg-[rgba(10,22,32,0.96)] shadow-[0_40px_100px_-10px_rgba(0,0,0,0.7)] flex flex-col"
      >
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-white/10">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="font-mono-hud text-[12px] uppercase tracking-[0.16em] text-[var(--hud-accent-2)]">
              ◢ POKÉDEX
            </span>
            <span className="font-display text-[16px] font-bold text-[var(--ink-0)] truncate">
              {current.name}
            </span>
            <div className="flex gap-1.5">
              {current.types.map((t) => (
                <TypeChip key={t} t={t.toLowerCase()} />
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="chunky ghost font-display text-[11px] flex-shrink-0"
            style={{ padding: '5px 12px' }}
            aria-label="Close"
          >
            ESC · CLOSE
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 no-scrollbar">
          <PokemonDexDetail
            p={current}
            moves={moves}
            smogon={smogon}
            onSelectSpecies={(id) => {
              const next = pokemonById[id];
              if (next) setCurrent(next);
            }}
          />
        </div>
      </div>
    </div>
  );
}
