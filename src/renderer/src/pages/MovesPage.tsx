import { useMemo, useState } from 'react';
import type { Move, Pokemon } from '../lib/types';
import { buildLearnerIndex } from '../lib/moveInfo';
import { ModuleFrame } from '../components/hud/ModuleFrame';
import { TypeChip } from '../components/hud/HudPrimitives';
import { MoveList } from '../components/MoveList';
import { MoveDetail } from '../components/MoveDetail';

export function MovesPage({
  pokemon,
  moves,
}: {
  pokemon: Pokemon[];
  moves: Record<string, Move>;
}) {
  const moveList = useMemo(() => Object.values(moves).sort((a, b) => a.name.localeCompare(b.name)), [moves]);
  const learnerIndex = useMemo(() => buildLearnerIndex(pokemon), [pokemon]);
  const [selected, setSelected] = useState<Move | null>(moveList[0] ?? null);

  const learners = useMemo(
    () => (selected ? learnerIndex.get(selected.id) ?? [] : []),
    [selected, learnerIndex],
  );

  return (
    <ModuleFrame
      subtitle={`${moveList.length} moves · power, coverage & learnsets`}
      side={selected && <TypeChip t={selected.type.toLowerCase()} size="md" />}
    >
      <div className="grid grid-cols-[minmax(300px,420px),1fr] gap-5 items-start">
        <div className="h-[62vh] min-h-[320px] overflow-hidden">
          <MoveList moves={moveList} selectedId={selected?.id} onSelect={setSelected} />
        </div>
        <div className="min-w-0">{selected && <MoveDetail m={selected} learners={learners} />}</div>
      </div>
    </ModuleFrame>
  );
}
