// Forms older builds saved that Showdown has no standalone entry for in either
// supported format; each maps to the closest form that has one.
const RENAMED: Record<string, string> = {
  greninjaash: 'greninjabond',
  floetteeternal: 'floette',
  eternatuseternamax: 'eternatus',
};

/**
 * Showdown's id for a species name or an id saved by an older build:
 * "Mr. Mime" -> "mrmime", "great tusk" -> "greattusk", "flabébé" -> "flabebe".
 */
export function toSpeciesId(nameOrId: string): string {
  const id = nameOrId
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return RENAMED[id] ?? id;
}
