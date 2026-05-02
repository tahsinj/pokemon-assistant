import type { HudAlert } from '../../lib/hudFixtures';

const COLORS: Record<HudAlert['sev'], [string, string]> = {
  warn: ['#ffb84d', 'rgba(255,184,77,.12)'],
  info: ['var(--hud-accent-2)', 'rgba(86,230,194,.10)'],
  ok: ['#7cd87b', 'rgba(124,216,123,.10)'],
};

export function AlertStack({ alerts }: { alerts: HudAlert[] }) {
  return (
    <div className="flex flex-col gap-1.5 items-end">
      {alerts.map((a, i) => {
        const [c, bg] = COLORS[a.sev];
        return (
          <div
            key={i}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full"
            style={{ background: bg, border: `1px solid ${c}`, backdropFilter: 'blur(10px)' }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: c, boxShadow: `0 0 6px ${c}` }}
            />
            <span className="font-mono-hud text-[14px]" style={{ color: c }}>
              {a.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}
