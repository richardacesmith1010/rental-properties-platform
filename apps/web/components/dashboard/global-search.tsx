"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export interface GlobalSearchItem {
  id: string;
  label: string;
  category: string;
  href: string;
  description?: string;
  keywords?: string[];
}

interface GlobalSearchProps {
  items: GlobalSearchItem[];
  placeholder?: string;
}

export function GlobalSearch({ items, placeholder = "Search properties, units, tenants..." }: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim().toLowerCase()), 300);
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredItems = useMemo(() => {
    if (!debouncedQuery) {
      return [];
    }

    return items.filter((item) => {
      const haystack = [item.label, item.description, item.category, ...(item.keywords ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(debouncedQuery);
    });
  }, [debouncedQuery, items]);

  const groupedItems = useMemo(() => {
    const grouped = new Map<string, GlobalSearchItem[]>();
    for (const item of filteredItems.slice(0, 12)) {
      const existing = grouped.get(item.category) ?? [];
      existing.push(item);
      grouped.set(item.category, existing);
    }
    return Array.from(grouped.entries());
  }, [filteredItems]);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <Input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="pl-9"
        />
      </div>

      {open && debouncedQuery ? (
        <div className="absolute z-50 mt-2 max-h-96 w-full overflow-y-auto rounded-xl border border-zinc-200 bg-white p-2 shadow-xl">
          {groupedItems.length === 0 ? (
            <p className="px-3 py-2 text-sm text-zinc-500">No matching results.</p>
          ) : (
            <div className="space-y-3">
              {groupedItems.map(([category, group]) => (
                <div key={category}>
                  <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                    {category}
                  </p>
                  <div className="space-y-1">
                    {group.map((item) => (
                      <Link
                        key={item.id}
                        href={item.href}
                        className="block rounded-lg px-3 py-2 hover:bg-violet-50"
                        onClick={() => setOpen(false)}
                        title={`Open ${item.label}.`}
                      >
                        <p className="text-sm font-medium text-zinc-900">{item.label}</p>
                        {item.description ? (
                          <p className="text-xs text-zinc-500">{item.description}</p>
                        ) : null}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
