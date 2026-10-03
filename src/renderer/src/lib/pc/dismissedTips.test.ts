import { afterEach, describe, expect, it } from 'vitest';
import { dismissalId, loadDismissed, toggleDismissed, partitionDismissed } from './dismissedTips';
import type { OptSuggestion } from './optimize';

const tip = (key: string): OptSuggestion => ({
  category: 'move',
  severity: 'medium',
  key,
  title: key,
  detail: '',
});

describe('dismissedTips', () => {
  it('toggles an id in and back out', () => {
    const id = dismissalId('toxapex', 'move:add:scald');
    const added = toggleDismissed(new Set(), id);
    expect(added.has(id)).toBe(true);
    const removed = toggleDismissed(added, id);
    expect(removed.has(id)).toBe(false);
  });

  it('scopes dismissals by species - same key, different species stays visible', () => {
    const dismissed = new Set([dismissalId('toxapex', 'move:add:scald')]);
    const review = [tip('move:add:scald'), tip('move:add:knockoff')];

    const tox = partitionDismissed(review, 'toxapex', dismissed);
    expect(tox.active.map((s) => s.key)).toEqual(['move:add:knockoff']);
    expect(tox.hidden.map((s) => s.key)).toEqual(['move:add:scald']);

    // A different species with the same suggestion key is unaffected.
    const other = partitionDismissed(review, 'starmie', dismissed);
    expect(other.hidden).toEqual([]);
    expect(other.active).toHaveLength(2);
  });
});

describe('loadDismissed', () => {
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('rewrites species ids saved by older builds', () => {
    (globalThis as { localStorage?: Pick<Storage, 'getItem'> }).localStorage = {
      getItem: (k: string) => (k === 'cobblemon-dismissed-tips' ? JSON.stringify(['great tusk::move:scald']) : null),
    };
    expect([...loadDismissed()]).toEqual(['greattusk::move:scald']);
  });
});
