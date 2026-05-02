import { useEffect, useState } from 'react';
import type { HudTrainer } from '../../lib/hudFixtures';

export function WorldScanner({
  trainer,
  biome,
}: {
  trainer: HudTrainer;
  biome: string;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="world-scanner mono-panel">
      <div className="ws-head">
        <span>◢ World Scanner</span>
        <span className="ws-link">SYNC</span>
      </div>
      <div className="ws-radar" />
      <div className="ws-region">{trainer.region}</div>
      <div className="ws-biome">
        <span className="b-dot" /> {biome}
      </div>
      <div className="ws-grid">
        <div>
          <span className="k">Time</span>
          <span className="v">{time}</span>
        </div>
        <div>
          <span className="k">Wx</span>
          <span className="v">Clear</span>
        </div>
        <div>
          <span className="k">Lux</span>
          <span className="v">14</span>
        </div>
      </div>
      <div className="ws-coords">
        <span className="grp">
          <span className="ax">X</span>−312
        </span>
        <span className="grp">
          <span className="ax">Y</span>71
        </span>
        <span className="grp">
          <span className="ax">Z</span>488
        </span>
      </div>
    </div>
  );
}
