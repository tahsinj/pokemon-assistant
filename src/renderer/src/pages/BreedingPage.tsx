import { useMemo, useState } from 'react';
import { ModuleFrame, SectionHead } from '../components/hud/ModuleFrame';

const FLAME_BODY_MULT = 0.75;

const BREEDING_CHECKLIST = [
  { id: 'destiny-knot', label: 'Destiny Knot - IV inheritance (5 from parents)', note: 'Crafting recipe varies; often dungeon / shop grind on Rivals.' },
  { id: 'everstone', label: 'Everstone - passes nature to offspring', note: 'Common crafting / world loot.' },
  { id: 'power-items', label: 'Power items - guarantee EV on parent passes down', note: 'Boss drops / player market.' },
  { id: 'flame-body', label: 'Flame Body / Magma Armor party slot', note: 'Reduces hatch time by ~25% (stack with your egg timer below).' },
] as const;

export function BreedingPage() {
  const [baseMinutes, setBaseMinutes] = useState(90);
  const [flameBody, setFlameBody] = useState(true);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const effectiveMinutes = useMemo(
    () => Math.max(1, baseMinutes * (flameBody ? FLAME_BODY_MULT : 1)),
    [baseMinutes, flameBody],
  );

  const eta = useMemo(() => {
    if (startedAt == null) return null;
    return new Date(startedAt + effectiveMinutes * 60_000);
  }, [startedAt, effectiveMinutes]);

  const toggle = (id: string) => {
    setChecked((c) => ({ ...c, [id]: !c[id] }));
  };

  return (
    <ModuleFrame
      kicker="◢ BREEDING"
      title="Hatchery"
      subtitle="egg timer + material grind checklist · times are estimates"
      side={
        eta && (
          <div className="mono-panel px-3 py-1 rounded-full font-mono-hud text-[14px] text-[var(--hud-accent-2)]">
            ETA · {eta.toLocaleTimeString()}
          </div>
        )
      }
    >
      <div className="grid grid-cols-2 gap-4 hud-form">
        <div className="mono-panel p-3 rounded-[10px]">
          <SectionHead label="EGG HATCH TIMER" />
          <label className="flex items-center gap-2 mb-2.5">
            Base hatch time (minutes)
            <input
              type="number"
              min={1}
              max={600}
              value={baseMinutes}
              onChange={(e) => setBaseMinutes(Math.max(1, Number(e.target.value) || 1))}
              className="w-20"
            />
          </label>
          <label className="flex items-center gap-2 mb-3">
            <input type="checkbox" checked={flameBody} onChange={(e) => setFlameBody(e.target.checked)} />
            Flame Body / ~25% faster
          </label>
          <p className="font-mono-hud text-[15px] text-[var(--ink-1)] m-0 mb-3">
            Effective estimate:{' '}
            <strong className="text-[var(--hud-accent)]">{effectiveMinutes.toFixed(0)}</strong> minutes
          </p>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              className="chunky font-display text-[12px]"
              style={{ '--c': 'var(--hud-accent-2)', padding: '8px 14px' } as React.CSSProperties}
              onClick={() => setStartedAt(Date.now())}
            >
              START TIMER
            </button>
            <button
              type="button"
              className="chunky ghost font-display text-[12px]"
              style={{ padding: '8px 14px' }}
              onClick={() => setStartedAt(null)}
            >
              CLEAR
            </button>
          </div>
          {eta && (
            <p className="font-mono-hud text-[15px] text-[var(--ink-0)] mt-3 mb-0">
              Target done around: <strong>{eta.toLocaleString()}</strong>
            </p>
          )}
          <p className="font-mono-hud text-[13px] text-[var(--ink-2)] mt-3 mb-0">
            In-app ping when time is up is not wired yet - use your OS alarm or phone for now.
          </p>
        </div>

        <div className="mono-panel p-3 rounded-[10px]">
          <SectionHead label="MATERIAL CHECKLIST" extra="boss drop rates change with patches" />
          <div className="flex flex-col gap-2.5">
            {BREEDING_CHECKLIST.map((row) => (
              <label
                key={row.id}
                className={`flex gap-2.5 items-start px-3 py-2 rounded-[10px] border cursor-pointer transition ${
                  checked[row.id]
                    ? 'border-[var(--hud-accent-2)]/40 bg-white/[.06]'
                    : 'border-white/10 bg-white/[.03] hover:bg-white/[.06]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={!!checked[row.id]}
                  onChange={() => toggle(row.id)}
                  className="mt-1"
                />
                <span>
                  <span
                    className={`font-display text-[14px] font-semibold ${
                      checked[row.id] ? 'line-through text-[var(--ink-2)]' : 'text-[var(--ink-0)]'
                    }`}
                  >
                    {row.label}
                  </span>
                  <div className="font-mono-hud text-[13px] text-[var(--ink-2)] mt-0.5">{row.note}</div>
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </ModuleFrame>
  );
}
