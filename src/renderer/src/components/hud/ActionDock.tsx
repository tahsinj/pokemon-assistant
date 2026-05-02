import type { CSSProperties } from 'react';

interface Action {
  id: string;
  label: string;
  c: string;
  hint: string;
}

const ACTIONS: Action[] = [
  { id: 'catch', label: 'CATCH', c: 'var(--hud-accent)', hint: 'Spawn Scout' },
  { id: 'heal', label: 'HEAL', c: '#ff7e8d', hint: 'Use potion · 4 left' },
  { id: 'swap', label: 'SWAP', c: 'var(--hud-accent-2)', hint: 'Rotate lead' },
  { id: 'note', label: 'NOTE', c: '#a9b5ff', hint: 'Log event' },
];

export function ActionDock() {
  return (
    <div className="flex items-end gap-3">
      {ACTIONS.map((a) => (
        <div key={a.id} className="relative has-tip">
          <button
            type="button"
            className="chunky text-[13px]"
            style={{ '--c': a.c, minWidth: 110 } as CSSProperties}
          >
            <span>{a.label}</span>
          </button>
          <div className="tip">{a.hint}</div>
        </div>
      ))}
    </div>
  );
}
