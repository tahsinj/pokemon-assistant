/** Teams another page wants Practice to start with (the damage calc's "Send to practice"). */

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
