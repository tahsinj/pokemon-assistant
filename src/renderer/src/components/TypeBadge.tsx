export function TypeBadge({ type }: { type: string }) {
  const t = type.toLowerCase();
  return <span className={`type type-${t}`}>{t}</span>;
}
