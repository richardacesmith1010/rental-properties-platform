"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";
import {
  ArrowRight,
  Search,
  Sparkles,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  searchCommandPalette,
  groupCommandResults,
  type CommandPaletteSection,
  type CommandPaletteProperty,
  type CommandPaletteTenant,
  type CommandPaletteTransaction,
  type CommandPaletteQuickAction,
  type CommandPaletteResult
} from "./command-palette-search";
export { searchCommandPalette, groupCommandResults } from "./command-palette-search";
export type {
  CommandPaletteSection,
  CommandPaletteProperty,
  CommandPaletteTenant,
  CommandPaletteTransaction,
  CommandPaletteQuickAction,
  CommandPaletteResult
} from "./command-palette-search";
import { cn } from "@/lib/format";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  sections: CommandPaletteSection[];
  properties: CommandPaletteProperty[];
  tenants: CommandPaletteTenant[];
  transactions?: CommandPaletteTransaction[];
  quickActions?: CommandPaletteQuickAction[];
  onSelectSection: (sectionId: string) => void;
  onSelectProperty: (propertyId: string) => void;
  onSelectTenant: (tenantId: string) => void;
  onSelectQuickAction?: (actionId: string) => void;
}

export function CommandPalette({
  open,
  onClose,
  sections,
  properties,
  tenants,
  transactions = [],
  quickActions = [],
  onSelectSection,
  onSelectProperty,
  onSelectTenant,
  onSelectQuickAction
}: CommandPaletteProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previousFocusedElementRef = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const results = useMemo(
    () =>
      searchCommandPalette({
        query,
        sections,
        properties,
        tenants,
        transactions,
        quickActions
      }),
    [properties, query, quickActions, sections, tenants, transactions]
  );

  const groupedResults = useMemo(() => groupCommandResults(results), [results]);

  const closePalette = useCallback(() => {
    const elementToRestore = previousFocusedElementRef.current;
    onClose();
    window.requestAnimationFrame(() => {
      elementToRestore?.focus?.();
    });
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }

    previousFocusedElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuery("");
    setActiveIndex(0);
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) {
    return null;
  }

  const clampedActiveIndex = results.length === 0 ? -1 : Math.min(activeIndex, results.length - 1);
  const activeResult = clampedActiveIndex >= 0 ? results[clampedActiveIndex] : null;
  const activeResultId = activeResult ? `command-palette-option-${activeResult.type}-${activeResult.id}` : undefined;

  const handleSelect = (result: CommandPaletteResult) => {
    if (result.type === "section" && result.sectionId) {
      onSelectSection(result.sectionId);
    }

    if (result.type === "property") {
      onSelectProperty(result.id);
    }

    if (result.type === "tenant") {
      onSelectTenant(result.id);
    }

    if (result.type === "transaction") {
      if (result.propertyId) {
        onSelectProperty(result.propertyId);
      }
      if (result.sectionId) {
        onSelectSection(result.sectionId);
      }
    }

    if (result.type === "quick_action") {
      onSelectQuickAction?.(result.id);
    }

    closePalette();
  };

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (results.length === 0 ? 0 : (current + 1) % results.length));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) =>
        results.length === 0 ? 0 : (current - 1 + results.length) % results.length
      );
      return;
    }

    if (event.key === "Enter") {
      if (clampedActiveIndex >= 0) {
        event.preventDefault();
        handleSelect(results[clampedActiveIndex]);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closePalette();
    }
  };

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      const focusableElements = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), ' +
          'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusableElements || focusableElements.length === 0) {
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closePalette();
    }
  };

  return (
    <div
      className={
        "fixed inset-0 z-[120] flex items-start justify-center " +
        "bg-[color-mix(in_srgb,var(--ink)_55%,transparent)] px-4 py-16 backdrop-blur-sm"
      }
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          closePalette();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search commands"
        onKeyDown={handleDialogKeyDown}
        className="w-full max-w-2xl overflow-hidden rounded-3xl border border-border/60 bg-card shadow-2xl"
      >
        <div className="border-b border-border/60 px-5 py-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Search sections, properties, tenants, and payments..."
              className="h-12 border-border/60 bg-background pl-10 pr-14 text-sm shadow-sm"
              role="combobox"
              aria-label="Search commands"
              aria-controls="command-palette-results"
              aria-expanded="true"
              aria-autocomplete="list"
              aria-activedescendant={activeResultId}
              aria-describedby="command-palette-results-count"
            />
            <span
              className={
                "absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-border/60 " +
                "bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
              }
            >
              ⌘K
            </span>
          </div>
        </div>

        <div className="max-h-[28rem] overflow-y-auto px-3 py-3">
          <p id="command-palette-results-count" className="sr-only" aria-live="polite" aria-atomic="true">
            {results.length === 0 ? "No results found." : `${results.length} results found.`}
          </p>
          {groupedResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
              <div className="rounded-full bg-muted p-3">
                <Search className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="mt-4 text-sm font-semibold text-foreground">No matching results</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try a section name, property address, tenant email, or quick action.
              </p>
            </div>
          ) : (
            <div id="command-palette-results" role="listbox" aria-label="Command results">
              {groupedResults.map((group) => (
                <div key={group.label} className="pb-3 last:pb-0">
                  <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {group.label}
                  </p>
                  <div className="space-y-1">
                    {group.items.map((result) => {
                      const index = results.findIndex((item) => item.type === result.type && item.id === result.id);
                      const active = index === clampedActiveIndex;
                      const Icon = result.icon;
                      const optionId = `command-palette-option-${result.type}-${result.id}`;
                      return (
                        <button
                          key={`${result.type}:${result.id}`}
                          id={optionId}
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() => handleSelect(result)}
                          onFocus={() => setActiveIndex(index)}
                          onMouseEnter={() => setActiveIndex(index)}
                          onKeyDown={(event) => {
                            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                              event.preventDefault();
                              const nextIndex =
                                event.key === "ArrowDown"
                                  ? (index + 1) % results.length
                                  : (index - 1 + results.length) % results.length;
                              setActiveIndex(nextIndex);
                              const nextResult = results[nextIndex];
                              const nextButton = document.getElementById(
                                `command-palette-option-${nextResult.type}-${nextResult.id}`
                              );
                              nextButton?.focus();
                            }
                            if (event.key === "Escape") {
                              event.preventDefault();
                              closePalette();
                            }
                          }}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition",
                            active
                              ? "bg-primary/10 text-foreground shadow-sm ring-1 ring-primary/20"
                              : "text-foreground hover:bg-muted/70"
                          )}
                          title={`Open ${result.label}.`}
                        >
                          <div
                            aria-hidden="true"
                            className={cn(
                              "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border",
                              active
                                ? "border-primary/20 bg-primary/15 text-primary"
                                : "border-border/60 bg-background text-muted-foreground"
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className={cn("truncate text-sm", active ? "font-semibold" : "font-medium")}>
                                {result.label}
                              </span>
                              {result.type === "quick_action" ? (
                                <Sparkles aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-primary" />
                              ) : null}
                            </div>
                            <p className="truncate text-xs text-muted-foreground">{result.secondary}</p>
                          </div>
                          <div className="hidden shrink-0 items-center gap-2 sm:flex">
                            <span
                              className={
                                "rounded-md border border-border/60 bg-background px-2 py-0.5 " +
                                "text-[11px] text-muted-foreground"
                              }
                            >
                              {result.shortcutHint ?? "Enter"}
                            </span>
                            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
