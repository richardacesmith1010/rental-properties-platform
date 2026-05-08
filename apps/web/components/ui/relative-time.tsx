"use client";

import { useEffect, useState } from "react";
import {
  formatDate,
  formatDateTime,
  formatMonthDay,
  formatRelativeTime
} from "@/lib/format";
import { formatRelativeNotificationTime } from "@/lib/notification-feed";

type RelativeTimeVariant = "default" | "notification";
type RelativeTimeFallback = "date" | "dateTime" | "monthDay";

interface RelativeTimeProps {
  value: string | Date | null | undefined;
  variant?: RelativeTimeVariant;
  fallback?: RelativeTimeFallback;
  className?: string;
  title?: string;
}

function getFallbackText(
  value: string | Date | null | undefined,
  fallback: RelativeTimeFallback
): string {
  if (fallback === "date") {
    return formatDate(value);
  }
  if (fallback === "monthDay") {
    return formatMonthDay(value);
  }
  return formatDateTime(value);
}

function getRelativeText(
  value: string | Date | null | undefined,
  variant: RelativeTimeVariant
): string {
  if (variant === "notification") {
    const resolvedValue = value instanceof Date ? value.toISOString() : value;
    return resolvedValue ? formatRelativeNotificationTime(resolvedValue) : "";
  }

  return formatRelativeTime(value);
}

export function RelativeTime({
  value,
  variant = "default",
  fallback = "dateTime",
  className,
  title
}: RelativeTimeProps) {
  const fallbackText = getFallbackText(value, fallback);
  const [text, setText] = useState(fallbackText);

  useEffect(() => {
    const updateText = () => {
      setText(getRelativeText(value, variant));
    };

    setText(fallbackText);
    updateText();

    const intervalId = window.setInterval(updateText, 60_000);
    return () => window.clearInterval(intervalId);
  }, [fallbackText, value, variant]);

  return (
    <span suppressHydrationWarning className={className} title={title}>
      {text}
    </span>
  );
}
