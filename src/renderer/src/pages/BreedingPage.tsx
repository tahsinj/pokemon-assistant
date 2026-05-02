import { useMemo, useState } from 'react';

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
    <div>
      <h1 className="page-title">Breeding &amp; grind</h1>
      <p className="page-sub">
        Cobblemon Rivals breeding is slow (often ~1–2h per egg even with optimizations). Use the timer as a wall-clock
        reminder; times are estimates - confirm in-game.
      </p>

      <div className="page-grid" style={{ maxHeight: 'none', gridTemplateColumns: '1fr 1fr' }}>
        <div className="panel">
          <div className="section-head">Egg hatch timer</div>
          <label style={{ display: 'block', marginBottom: 10 }}>
            Base hatch time (minutes)
            <input
              type="number"
              min={1}
              max={600}
              value={baseMinutes}
              onChange={(e) => setBaseMinutes(Math.max(1, Number(e.target.value) || 1))}
              style={{ width: 80, marginLeft: 8 }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <input type="checkbox" checked={flameBody} onChange={(e) => setFlameBody(e.target.checked)} />
            Flame Body / ~25% faster
          </label>
          <p style={{ fontSize: 13, color: 'var(--fg-dim)', margin: '0 0 12px' }}>
            Effective estimate: <strong style={{ color: 'var(--accent)' }}>{effectiveMinutes.toFixed(0)}</strong> minutes
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" onClick={() => setStartedAt(Date.now())}>
              Start timer (now)
            </button>
            <button type="button" onClick={() => setStartedAt(null)}>Clear</button>
          </div>
          {eta && (
            <p style={{ marginTop: 14, fontSize: 14 }}>
              Target done around:{' '}
              <strong>{eta.toLocaleString()}</strong>
            </p>
          )}
          <p style={{ marginTop: 12, fontSize: 11, color: 'var(--fg-dim)' }}>
            In-app ping when time is up is not wired yet - use your OS alarm or phone for now.
          </p>
        </div>

        <div className="panel">
          <div className="section-head">Material checklist</div>
          <p style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 0 }}>
            Track what you still need. Boss drop rates on Rivals change with patches - treat notes as generic.
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {BREEDING_CHECKLIST.map((row) => (
              <li key={row.id} style={{ marginBottom: 12 }}>
                <label style={{ cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <input type="checkbox" checked={!!checked[row.id]} onChange={() => toggle(row.id)} />
                  <span>
                    <strong>{row.label}</strong>
                    <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>{row.note}</div>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
