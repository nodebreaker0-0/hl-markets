'use client';

// Pill search input. Sort dropdown was removed — lists are short enough that
// default ordering (Pending: earliest expiry first, Markets: newest first,
// Historical: most recently settled first) is sufficient.

import { useId } from 'react';

export interface SearchBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  placeholder?: string;
}

export function SearchBar({ query, onQueryChange, placeholder }: SearchBarProps) {
  const id = useId();
  return (
    <div className="relative">
      <input
        id={`${id}-q`}
        type="search"
        inputMode="search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={placeholder ?? 'Search markets…'}
        spellCheck={false}
        autoComplete="off"
        className="w-full rounded-full bg-surface-elevated px-4 py-2.5 text-sm text-on-surface ring-1 ring-divider placeholder:text-on-surface-muted/70 focus:outline-none focus:ring-2 focus:ring-primary/60"
      />
    </div>
  );
}
