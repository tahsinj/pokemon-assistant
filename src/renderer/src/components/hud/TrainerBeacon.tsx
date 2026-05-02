import type { CSSProperties } from 'react';
import type { HudTrainer } from '../../lib/hudFixtures';

export function TrainerBeacon({ trainer }: { trainer: HudTrainer }) {
  return (
    <div className="slant" style={{ '--slant': '10deg' } as CSSProperties}>
      <div className="slant-body rounded-[18px] px-6 py-3">
        <div className="slant-content flex items-center gap-4">
          <div className="relative w-[58px] h-[66px] flex items-center justify-center">
            <div
              className="absolute inset-0 hex"
              style={{
                background: 'linear-gradient(160deg, var(--hud-accent), #b6740a)',
                boxShadow: '0 6px 16px rgba(255,198,54,.35), inset 0 1px 0 rgba(255,255,255,.4)',
              }}
            />
            <div
              className="absolute inset-[3px] hex"
              style={{ background: 'radial-gradient(60% 60% at 35% 30%, #4a3210, #0c0903)' }}
            />
            <div className="font-display text-2xl font-bold relative z-10" style={{ color: 'var(--hud-accent)' }}>
              {trainer.name.charAt(0)}
            </div>
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[var(--hud-accent-2)] border-2 border-[#08131c] font-mono-hud text-[12px] flex items-center justify-center text-black font-bold">
              {trainer.badges}
            </div>
          </div>
          <div className="min-w-0">
            <div className="font-display text-[17px] leading-none font-bold flex items-center gap-2">
              {trainer.name}
              <span className="font-mono-hud text-[12px] text-[var(--ink-2)]">{trainer.handle}</span>
            </div>
            <div className="font-mono-hud text-[14px] text-[var(--hud-accent-2)] uppercase tracking-wider mt-0.5">
              {trainer.title}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="font-mono-hud text-[13px] text-[var(--ink-1)] uppercase">LV</div>
              <div className="font-display text-[19px] font-bold leading-none">{trainer.level}</div>
              <div className="relative h-2 flex-1 min-w-[60px] rounded-full bg-black/40 overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${trainer.xp * 100}%`,
                    background: 'linear-gradient(90deg, var(--hud-accent), var(--hud-accent-2))',
                    boxShadow: '0 0 8px var(--hud-accent)',
                  }}
                />
              </div>
              <div className="font-mono-hud text-[12px] text-[var(--ink-2)]">
                {Math.round(trainer.xp * 100)}%
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
