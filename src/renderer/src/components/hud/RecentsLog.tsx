import type { HudRecent } from '../../lib/hudFixtures';

const GLYPH: Record<HudRecent['kind'], string> = {
  catch: '◉',
  battle: '✕',
  spawn: '◇',
  trade: '⇄',
  level: '▲',
};
const COLOR: Record<HudRecent['kind'], string> = {
  catch: 'var(--hud-accent)',
  battle: '#ff7e8d',
  spawn: 'var(--hud-accent-2)',
  trade: '#a9b5ff',
  level: '#7cd87b',
};

export function RecentsLog({ recents }: { recents: HudRecent[] }) {
  return (
    <div className="glass notch px-4 py-3 rounded-[14px]">
      <div className="flex items-center justify-between mb-2">
        <div className="font-mono-hud text-[14px] uppercase tracking-widest text-[var(--hud-accent-2)]">
          ◢ FIELD LOG
        </div>
        <div className="font-mono-hud text-[12px] text-[var(--ink-2)]">{recents.length} events</div>
      </div>
      <div className="flex flex-col gap-1.5">
        {recents.map((r, i) => (
          <div key={i} className="flex items-start gap-2.5 py-1">
            <span
              className="font-display text-[14px] mt-0.5 leading-none"
              style={{ color: COLOR[r.kind] }}
            >
              {GLYPH[r.kind]}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-[var(--ink-0)] leading-tight">{r.text}</div>
              <div className="font-mono-hud text-[12px] text-[var(--ink-2)] uppercase mt-0.5">{r.meta}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
