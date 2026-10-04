/**
 * Cross-page snapshot of the Team Builder's current squad. Pages unmount on
 * tab switch (App renders one page at a time), so the damage calc and the
 * battle tracker can't read the builder's state directly; the builder mirrors
 * it here on every change instead. Module singleton, lives as long as the
 * renderer.
 */

import type { MemberDetail } from './bridgeTypes';

export interface TeamDraftMember {
  speciesId: string;
  detail: MemberDetail | null;
}

/** Which saved team the builder is editing, so reopening it restores the same team. */
export interface TeamDraftMeta {
  teamId?: string;
  name: string;
  tag: string;
}

let draft: (TeamDraftMember | null)[] = [null, null, null, null, null, null];
let meta: TeamDraftMeta | null = null;

export function setTeamDraft(members: (TeamDraftMember | null)[]): void {
  draft = members.slice(0, 6);
}

export function getTeamDraft(): (TeamDraftMember | null)[] {
  return draft;
}

export function setTeamDraftMeta(next: TeamDraftMeta): void {
  meta = next;
}

/** Null until the Team Builder has been opened this session. */
export function getTeamDraftMeta(): TeamDraftMeta | null {
  return meta;
}
