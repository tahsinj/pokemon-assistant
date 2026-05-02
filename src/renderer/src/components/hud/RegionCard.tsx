import type { HudTrainer } from '../../lib/hudFixtures';

export function RegionCard({ trainer, biome }: { trainer: HudTrainer; biome: string }) {
  return (
    <div className="glass notch rounded-[14px] p-3">
      <div className="font-mono-hud text-[14px] uppercase tracking-widest text-[var(--hud-accent-2)] mb-2">
        ◢ REGION
      </div>
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full flex-shrink-0"
          style={{
            background: 'radial-gradient(circle at 35% 30%, var(--biome-c), var(--biome-a))',
            boxShadow:
              'inset 0 -4px 8px rgba(0,0,0,.4), 0 0 14px color-mix(in oklab, var(--biome-c) 50%, transparent)',
            border: '1px solid rgba(255,255,255,.15)',
          }}
        />
        <div className="min-w-0">
          <div className="font-display text-[15px] font-bold truncate">{trainer.region}</div>
          <div className="font-mono-hud text-[12px] text-[var(--ink-2)] uppercase tracking-wider">{biome}</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3 text-center">
        {[
          ['DAY', '04:12'],
          ['TEMP', '18°C'],
          ['WIND', 'S 3m'],
        ].map(([k, v]) => (
          <div key={k} className="mono-panel px-1 py-1 rounded-[6px]">
            <div className="text-[11px] uppercase opacity-60">{k}</div>
            <div className="text-[15px] text-white leading-tight">{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
