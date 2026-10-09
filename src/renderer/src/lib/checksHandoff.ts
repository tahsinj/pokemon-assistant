/** A species another page wants the Checks tool to open on (the Pokédex's "Find checks"). */

let pending: string | null = null;

export function openChecksFor(speciesId: string): void {
  pending = speciesId;
}

/** The waiting species id, once; null when there is none. */
export function takeChecksTarget(): string | null {
  const id = pending;
  pending = null;
  return id;
}
