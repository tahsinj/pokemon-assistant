import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { HeldItem } from '../lib/types';
import { buildItemFuse, searchItems } from '../lib/itemSearch';

export function ItemSearchInput({
  value,
  onChange,
  items,
  placeholder = 'Search held items…',
  disabled,
}: {
  value: string;
  onChange: (name: string) => void;
  items: HeldItem[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const fuse = useMemo(() => buildItemFuse(items), [items]);

  const suggestions = useMemo(() => {
    const q = value.trim();
    if (!q) return items.slice(0, 14);
    return searchItems(fuse, q, 14);
  }, [value, fuse, items]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div ref={rootRef} className="item-search" style={{ position: 'relative' }}>
      <input
        type="text"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        list={listId}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
        style={{ width: '100%' }}
        autoComplete="off"
      />
      <datalist id={listId}>
        {items.map((item) => (
          <option key={item.id} value={item.name} />
        ))}
      </datalist>
      {open && suggestions.length > 0 && (
        <ul className="item-search-menu" role="listbox">
          {suggestions.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                role="option"
                className="item-search-option"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(item.name);
                  setOpen(false);
                }}
              >
                <span>{item.name}</span>
                <span className="item-search-meta">{item.category}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
