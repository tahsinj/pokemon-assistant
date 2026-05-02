import type { BaseStats, StatKey } from '../lib/types';
import { STAT_LABELS } from '../lib/stats';

const ORDER: StatKey[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

export function StatBars({ stats, max = 180 }: { stats: BaseStats; max?: number }) {
  return (
    <div>
      {ORDER.map((k) => (
        <div className="stat-row" key={k}>
          <span className="label">{STAT_LABELS[k]}</span>
          <span className="value">{stats[k]}</span>
          <div className="stat-bar">
            <div className="fill" style={{ width: `${Math.min(100, (stats[k] / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
