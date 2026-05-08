"use client";

import { useEffect, useState } from "react";

export function getTimeOfDayGreeting(date = new Date(), eveningStartsAt = 17): string {
  const hour = date.getHours();

  if (hour < 12) {
    return "Good morning";
  }

  if (hour < eveningStartsAt) {
    return "Good afternoon";
  }

  return "Good evening";
}

export function useTimeOfDayGreeting(eveningStartsAt = 17) {
  const [greeting, setGreeting] = useState<string | null>(null);

  useEffect(() => {
    setGreeting(getTimeOfDayGreeting(new Date(), eveningStartsAt));
  }, [eveningStartsAt]);

  return greeting;
}
