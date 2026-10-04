/**
 * Layout checks that run inside the page. Each returns a list of human-readable
 * violations, empty when the page is clean. They are plain functions passed to
 * page.evaluate, so they must not reference anything outside their own body.
 */

/** The page header's actions must not collide with the close button or its hint. */
export function headerClearOfClose(): string[] {
  const rect = (sel: string) => document.querySelector(sel)?.getBoundingClientRect() ?? null;
  const actions = rect('[data-ui="page-actions"]');
  const out: string[] = [];
  for (const sel of ['[data-ui="close"]', '[data-ui="close-hint"]']) {
    const r = rect(sel);
    if (!actions || !r) continue;
    const overlap =
      actions.left < r.right && actions.right > r.left && actions.top < r.bottom && actions.bottom > r.top;
    if (overlap) out.push(`page actions overlap ${sel}`);
  }
  return out;
}

/**
 * Content cut off: an element that sticks out past the right edge of the
 * nearest ancestor with overflow hidden, or text clipped inside its own box
 * with no ellipsis. Scrollable ancestors are fine, that overflow is reachable.
 */
export function clippedContent(): string[] {
  const root = document.querySelector('.dive-content');
  if (!root) return ['no open page'];
  const out: string[] = [];
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
    if (!el.offsetParent || !(el.textContent ?? '').trim()) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    let a = el.parentElement;
    while (a && a !== root.parentElement) {
      const ox = getComputedStyle(a).overflowX;
      if (ox === 'auto' || ox === 'scroll') break;
      if (ox === 'hidden' || ox === 'clip') {
        const ar = a.getBoundingClientRect();
        if (r.right > ar.right + 1) {
          const own = Array.from(el.childNodes)
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => n.textContent)
            .join('')
            .trim();
          if (own) out.push(`"${own.slice(0, 40)}" runs ${Math.round(r.right - ar.right)}px past its container`);
        }
        break;
      }
      a = a.parentElement;
    }
    // Text cut off inside its own box without an ellipsis to say so.
    const cs = getComputedStyle(el);
    const ownText = Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim());
    if (
      ownText &&
      (cs.overflowX === 'hidden' || cs.overflowX === 'clip') &&
      cs.textOverflow !== 'ellipsis' &&
      el.scrollWidth > el.clientWidth + 1
    ) {
      out.push(`"${(el.textContent ?? '').trim().slice(0, 40)}" is cut off by ${el.scrollWidth - el.clientWidth}px`);
    }
  }
  return [...new Set(out)];
}

/** Species names in list rows stay readable: at least 10 characters show before any ellipsis. */
export function truncatedNames(): string[] {
  const out: string[] = [];
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-ui="species-name"]'))) {
    const text = (el.textContent ?? '').trim();
    if (!text || el.scrollWidth <= el.clientWidth + 1) continue;
    const charWidth = el.scrollWidth / text.length;
    const visible = Math.floor(el.clientWidth / charWidth);
    if (visible < Math.min(10, text.length)) out.push(`"${text}" shows about ${visible} characters`);
  }
  return out;
}

/** Two list rows that read the same are indistinguishable (forms without a label). */
export function duplicateRows(): string[] {
  const seen = new Map<string, number>();
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-ui="species-row"]'))) {
    const text = (el.innerText ?? '').replace(/\s+/g, ' ').trim();
    seen.set(text, (seen.get(text) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([t, n]) => `${n} rows read "${t.slice(0, 50)}"`);
}

/** Ability names shown to the user are display names, not lowercase ids. */
export function rawAbilityIds(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-ui="ability"]'))
    .map((el) => (el.textContent ?? '').trim())
    .filter((t) => /^[a-z0-9]+(\s*\(H\))?$/.test(t))
    .map((t) => `ability shown as id "${t}"`);
}

/**
 * Sentences (six or more words) are body copy: not monospace caps, and at
 * least 13px. Labels and numbers can stay in the HUD style.
 */
export function smallCapsBodyText(): string[] {
  const root = document.querySelector('.dive-content');
  if (!root) return [];
  const out: string[] = [];
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
    if (!el.offsetParent) continue;
    const own = Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (own.split(' ').filter((w) => /[a-z]/i.test(w)).length < 6) continue;
    const cs = getComputedStyle(el);
    const size = parseFloat(cs.fontSize);
    const mono = /mono|VT323/i.test(cs.fontFamily);
    if (cs.textTransform === 'uppercase' && mono) out.push(`mono caps sentence: "${own.slice(0, 50)}"`);
    else if (size < 13) out.push(`${size}px sentence: "${own.slice(0, 50)}"`);
  }
  return [...new Set(out)];
}

/**
 * Text that spills out of its own box: in-flow content (child boxes or text)
 * reaching past the right edge of a box that neither clips nor scrolls.
 * Absolutely positioned decorations, like a badge hanging off a corner, are
 * placed on purpose and don't count.
 */
export function spilledText(): string[] {
  const root = document.querySelector('.dive-content');
  if (!root) return [];
  const out: string[] = [];
  const contentRight = (el: HTMLElement): number => {
    let right = -Infinity;
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim()) {
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const r of Array.from(range.getClientRects())) right = Math.max(right, r.right);
      } else if (node instanceof HTMLElement && node.offsetParent !== null) {
        const pos = getComputedStyle(node).position;
        if (pos !== 'absolute' && pos !== 'fixed') right = Math.max(right, node.getBoundingClientRect().right);
      }
    }
    return right;
  };
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
    if (!el.offsetParent || el.clientWidth === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.overflowX !== 'visible' || cs.display === 'inline' || cs.display === 'contents') continue;
    const box = el.getBoundingClientRect();
    const over = contentRight(el) - box.right;
    if (over <= 2) continue;
    // Report the innermost box: skip it when a child already spills by itself.
    const childSpills = Array.from(el.children).some((c) => {
      if (!(c instanceof HTMLElement) || c.offsetParent === null) return false;
      return contentRight(c) - c.getBoundingClientRect().right > 2;
    });
    const text = (el.innerText ?? '').replace(/\s+/g, ' ').trim();
    if (!childSpills && text) out.push(`"${text.slice(0, 40)}" is ${Math.round(over)}px wider than its box`);
  }
  return [...new Set(out)];
}
