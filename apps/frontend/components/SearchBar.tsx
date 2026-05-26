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
        className="w-full rounded-full bg-hl-surface px-4 py-2.5 text-sm text-hl-text ring-1 ring-hl-border placeholder:text-hl-subtle/70 focus:outline-none focus:ring-2 focus:ring-hl-mint/60"
      />
    </div>
  );
}
