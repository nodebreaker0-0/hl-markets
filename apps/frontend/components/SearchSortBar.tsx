'use client';

// Polymarket-style filter row. Functional state in Phase C.

import { useId } from 'react';

export type Sort = 'closing-soon' | 'most-voted' | 'recent';

export interface SearchSortBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  sort: Sort;
  onSortChange: (s: Sort) => void;
}

export function SearchSortBar({ query, onQueryChange, sort, onSortChange }: SearchSortBarProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <input
          id={`${id}-q`}
          type="search"
          inputMode="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search outcomes, delistings, validators…"
          spellCheck={false}
          autoComplete="off"
          className="w-full rounded-full bg-surface-elevated px-4 py-2.5 text-sm text-on-surface ring-1 ring-divider placeholder:text-on-surface-muted/70 focus:outline-none focus:ring-2 focus:ring-primary/60"
        />
      </div>
      <label className="flex items-center gap-2 self-end text-xs text-on-surface-muted sm:self-auto">
        Sort
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as Sort)}
          className="rounded-full bg-surface-elevated px-3 py-1.5 text-xs text-on-surface ring-1 ring-divider focus:outline-none focus:ring-2 focus:ring-primary/60"
        >
          <option value="closing-soon">Closing soon</option>
          <option value="most-voted">Most voted</option>
          <option value="recent">Recently added</option>
        </select>
      </label>
    </div>
  );
}
