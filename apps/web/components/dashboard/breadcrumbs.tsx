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
    <nav aria-label="Breadcrumb">
      <ol className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0 text-sm text-muted-foreground">
        {items.map((item, index) => (
          <Fragment key={`${item.label}-${index}`}>
            {index > 0 ? (
              <li aria-hidden="true">
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </li>
            ) : null}
            <li aria-current={index === items.length - 1 ? "page" : undefined}>
              {item.onClick ? (
                <button
                  type="button"
                  onClick={item.onClick}
                  className="transition-colors hover:text-foreground"
                  title={`Go to ${item.label}.`}
                >
                  {item.label}
                </button>
              ) : (
                <span className="font-medium text-foreground">{item.label}</span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
