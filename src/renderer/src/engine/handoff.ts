/** Battles passed between pages: teams for Practice (the damage calc's "Send to practice"), and a finished practice log for Replay Review. */

export interface PracticeHandoff {
  playerTeam: string;
  botTeam: string;
}

let pending: PracticeHandoff | null = null;

export function sendToPractice(h: PracticeHandoff): void {
  pending = h;
}

/** The waiting handoff, once; null when there is none. */
export function takePracticeHandoff(): PracticeHandoff | null {
  const h = pending;
  pending = null;
  return h;
}

let review: string | null = null;

/** A finished practice battle's log for Replay Review to open (your side is p1). */
export function sendToReview(log: string): void {
  review = log;
}

/**
 * The practice log waiting for Replay Review. It stays until `clearReviewHandoff`,
 * because the page can mount more than once while it opens.
 */
export function reviewHandoff(): string | null {
  return review;
}

export function clearReviewHandoff(): void {
  review = null;
}
