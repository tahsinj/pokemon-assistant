import { useEffect, useState } from 'react';
import type { HudTrainer } from '../../lib/hudFixtures';

export function StatusTicker({ trainer }: { trainer: HudTrainer }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const winRate = Math.round((trainer.wins / Math.max(1, trainer.wins + trainer.losses)) * 100);
  const stats = [
    { k: 'CAUGHT', v: `${trainer.caught}/${trainer.total}` },
    { k: 'WIN', v: `${winRate}%` },
    { k: 'STREAK', v: `${trainer.streak}d` },
  ];

  return (
    <div className="mono-panel px-4 py-2 flex items-center gap-3 notch whitespace-nowrap max-w-full overflow-hidden">
      <div className="flex items-center gap-2 flex-shrink-0">
        <span
          className="w-2 h-2 rounded-full bg-[var(--hud-accent-2)]"
          style={{ boxShadow: '0 0 8px var(--hud-accent-2)', animation: 'hud-breathe 1.5s ease-in-out infinite' }}
        />
        <span className="text-[14px]">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <div className="h-4 w-px bg-[var(--hud-accent-2)]/30 flex-shrink-0" />
      {stats.map((s) => (
        <div key={s.k} className="flex items-baseline gap-1.5 flex-shrink-0">
          <span className="text-[12px] uppercase opacity-60 tracking-wider">{s.k}</span>
          <span className="text-[16px] text-white">{s.v}</span>
        </div>
      ))}
    </div>
  );
}
