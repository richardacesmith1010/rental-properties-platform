"use client";

import { Fragment } from "react";
import { ChevronRight } from "lucide-react";

export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex flex-wrap items-center gap-1.5 text-sm text-zinc-500"
    >
      {items.map((item, index) => (
        <Fragment key={`${item.label}-${index}`}>
          {index > 0 ? <ChevronRight className="h-3.5 w-3.5 text-zinc-400" /> : null}
          {item.onClick ? (
            <button
              type="button"
              onClick={item.onClick}
              className="transition-colors hover:text-zinc-900"
              title={`Go to ${item.label}.`}
            >
              {item.label}
            </button>
          ) : (
            <span className="font-medium text-zinc-900">{item.label}</span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
