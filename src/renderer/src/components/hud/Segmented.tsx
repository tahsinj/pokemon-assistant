/**
 * Canonical HUD segmented toggle (the `mono-panel rounded-full` pill bar used
 * across the dex/detail pages). Active segment fills with accent-2 on black.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'sm',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
  size?: 'sm' | 'md';
}) {
  const pad = size === 'md' ? 'px-4 py-1 text-[13px]' : 'px-3 py-1 text-[12px]';
  return (
    <div className="flex items-center gap-1 mono-panel rounded-full p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={`font-mono-hud uppercase tracking-wider rounded-full transition-colors ${pad} ${
            value === o.id ? 'bg-accent-2 text-black' : 'text-ink-2 hover:text-ink-1'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
