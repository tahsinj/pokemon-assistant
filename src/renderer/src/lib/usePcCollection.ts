/**
 * Read-only snapshot of every Pokémon stored in the PC (all boxes), for pages
 * that want to pick from the user's actual collection (Team Builder slots,
 * Counter Picker "my PC" mode). Loads once on mount; `reload()` refreshes.
 */

import { useCallback, useEffect, useState } from 'react';
import type { PcBoxSummary, PcPokemonRecord } from './bridgeTypes';

export interface PcCollection {
  /** Bridge available at all (Electron context with PC IPC wired). */
  available: boolean;
  loading: boolean;
  boxes: PcBoxSummary[];
  mons: PcPokemonRecord[];
  boxNameById: Record<string, string>;
  reload: () => void;
}

export function usePcCollection(): PcCollection {
  const bridge = typeof window !== 'undefined' ? window.assistant : undefined;
  const available = !!bridge?.pcBoxesList && !!bridge?.pcPokemonList;
  const [loading, setLoading] = useState(available);
  const [boxes, setBoxes] = useState<PcBoxSummary[]>([]);
  const [mons, setMons] = useState<PcPokemonRecord[]>([]);

  const reload = useCallback(() => {
    if (!bridge?.pcBoxesList || !bridge.pcPokemonList) return;
    setLoading(true);
    (async () => {
      try {
        const boxList = await bridge.pcBoxesList!();
        const perBox = await Promise.all(boxList.map((b) => bridge.pcPokemonList!(b.id)));
        setBoxes(boxList);
        setMons(perBox.flat());
      } catch {
        setBoxes([]);
        setMons([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [bridge]);

  useEffect(() => {
    reload();
  }, [reload]);

  const boxNameById: Record<string, string> = {};
  for (const b of boxes) boxNameById[b.id] = b.name;

  return { available, loading, boxes, mons, boxNameById, reload };
}
