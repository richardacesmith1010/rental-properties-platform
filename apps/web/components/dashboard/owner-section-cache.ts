"use client";

import type { OwnerBundleId } from "@/app/owner/owner-page-data";
import type { OwnerSectionData, OwnerSectionInput, OwnerSectionResult } from "@/lib/owner-section-transport";
import { decodeOwnerSectionResult } from "@/lib/owner-section-transport";
import { createContext, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export interface OwnerSectionCacheProps {
  loadedBundles: OwnerBundleId[];
  requirements: Record<string, OwnerBundleId[]>;
  account: string | null;
  mode?: string;
  property: string | null;
}

async function loadSection(input: OwnerSectionInput, signal: AbortSignal): Promise<OwnerSectionResult> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) params.set(key, value === true ? "1" : String(value));
  }
  const response = await fetch(`/api/owner/section-data?${params}`, {
    method: "GET", credentials: "same-origin", cache: "no-store", signal
  });
  if (!response.ok) return { error: "Unable to load this section." };
  return decodeOwnerSectionResult(await response.json());
}

function abortRequests(cache: {
  controllers: Set<AbortController>; clickController: AbortController | null;
  preloadFlight: unknown; attemptedPreloads: Set<string>;
}) {
  cache.controllers.forEach(controller => controller.abort());
  cache.controllers.clear();
  cache.clickController = null;
  cache.preloadFlight = null;
  cache.attemptedPreloads.clear();
}

function ownerScope(account: string | null, property: string | null) {
  return JSON.stringify([account, property || null]);
}

export function useOwnerSectionCache(props: OwnerSectionCacheProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, redraw] = useState(0);
  const serverScope = ownerScope(props.account, props.property);
  const scope = ownerScope(searchParams.get("account") ?? props.account,
    searchParams.get("property"));
  const state = useRef({
    server: props.loadedBundles, scope, epoch: 0, request: 0, pendingUrl: null as string | null,
    overlay: new Map<OwnerBundleId, OwnerSectionData>(), loading: false, waitingForServer: false,
    controllers: new Set<AbortController>(), clickController: null as AbortController | null,
    attemptedPreloads: new Set<string>(),
    preloadSchedule: 0,
    preloadIdle: null as number | null,
    preloadFlight: null as null | {
      section: string;
      scope: string;
      epoch: number;
      promise: Promise<OwnerSectionResult>;
    }
  });
  const propsRef = useRef(props);
  propsRef.current = props;
  const cache = state.current;
  // Render-time invalidation prevents even one frame of stale overlay after an RSC refresh.
  if (cache.server !== props.loadedBundles) {
    cache.server = props.loadedBundles;
    cache.scope = scope;
    abortRequests(cache);
    cache.epoch++;
    cache.overlay.clear();
    cache.loading = false;
    cache.waitingForServer = false;
    cache.pendingUrl = null;
  } else if (cache.scope !== scope && !cache.waitingForServer) {
    cache.scope = scope;
    abortRequests(cache);
    cache.epoch++;
    cache.overlay.clear();
    cache.loading = true;
    cache.waitingForServer = true;
  }

  const cancelScheduledPreload = useCallback(() => {
    const current = state.current;
    current.preloadSchedule++;
    if (current.preloadIdle === null) return;
    globalThis.clearTimeout(current.preloadIdle);
    current.preloadIdle = null;
  }, []);

  const invalidate = useCallback(() => {
    const current = state.current;
    cancelScheduledPreload();
    abortRequests(current);
    current.epoch++;
    current.overlay.clear();
    current.loading = true;
    current.waitingForServer = true;
    current.pendingUrl = null;
    redraw(value => value + 1);
  }, [cancelScheduledPreload]);
  const fullNavigate = useCallback((url: string) => {
    invalidate();
    state.current.pendingUrl = url;
    router.replace(url);
  }, [invalidate, router]);

  useEffect(() => {
    const onPopState = () => {
      invalidate();
      router.refresh();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [invalidate, router]);

  useEffect(() => () => {
    cancelScheduledPreload();
    abortRequests(state.current);
    state.current.epoch++;
  }, [cancelScheduledPreload]);

  const navigate = useCallback((url: string, section: string) => {
    const next = new URL(url, window.location.origin);
    const nextScope = ownerScope(next.searchParams.get("account") ?? props.account,
      next.searchParams.get("property"));
    const current = state.current;
    if (current.waitingForServer || nextScope !== current.scope || nextScope !== serverScope) {
      fullNavigate(url);
      return;
    }
    current.clickController?.abort();
    current.clickController = null;
    window.history.replaceState(null, "", url);
    const request = ++current.request;
    const epoch = current.epoch;
    const required = props.requirements[section];
    const loaded = new Set([...props.loadedBundles, ...current.overlay.keys()]);
    if (required && required.every(bundle => loaded.has(bundle))) {
      current.loading = false;
      redraw(value => value + 1);
      return;
    }
    current.loading = true;
    redraw(value => value + 1);
    const isCurrent = () => state.current.request === request && state.current.epoch === epoch;
    const preloadFlight = current.preloadFlight;
    const sharedPreload = preloadFlight?.section === section &&
      preloadFlight.scope === current.scope && preloadFlight.epoch === epoch;
    const controller = sharedPreload ? null : new AbortController();
    if (controller) {
      current.clickController = controller;
      current.controllers.add(controller);
    }
    const requestPromise = sharedPreload
      ? preloadFlight.promise
      : loadSection({
        section, account: next.searchParams.get("account") ?? props.account ?? undefined,
        property: next.searchParams.get("property") ?? undefined
      }, controller!.signal);
    void requestPromise.then(result => {
      if (!isCurrent() || controller?.signal.aborted) return;
      if (!("status" in result) || result.status !== "ready") {
        invalidate();
        router.refresh();
        return;
      }
      for (const bundle of result.data.loadedBundles) {
        current.overlay.delete(bundle);
        current.overlay.set(bundle, result.data);
      }
      current.loading = false;
      redraw(value => value + 1);
    }).catch(() => {
      if (!isCurrent() || controller?.signal.aborted) return;
      invalidate();
      router.refresh();
    }).finally(() => {
      if (controller) current.controllers.delete(controller);
      if (current.clickController === controller) current.clickController = null;
    });
  }, [fullNavigate, invalidate, props, router, serverScope]);

  const preloadSection = useCallback((sectionId: string, delay = 0) => {
    const current = state.current;
    cancelScheduledPreload();
    const scheduledId = current.preloadSchedule;
    const scheduledScope = current.scope;
    const scheduledEpoch = current.epoch;
    const run = () => {
      if (current.preloadSchedule !== scheduledId) return;
      current.preloadIdle = null;
      const connection = navigator as Navigator & { connection?: { saveData?: boolean } };
      if (connection.connection?.saveData || document.visibilityState === "hidden" || current.loading ||
          current.waitingForServer || current.scope !== scheduledScope || current.epoch !== scheduledEpoch) return;
      const existingFlight = current.preloadFlight;
      if (existingFlight) {
        void existingFlight.promise.catch(() => undefined).then(run);
        return;
      }
      const candidates = [sectionId === "overview" ? "daily-ops-home" : sectionId];
      const preload = async () => {
        for (const section of candidates) {
          if (connection.connection?.saveData || document.visibilityState === "hidden" || current.loading ||
              current.waitingForServer || current.scope !== scheduledScope ||
              current.epoch !== scheduledEpoch) return;
          const latestProps = propsRef.current;
          const loaded = new Set([...latestProps.loadedBundles, ...current.overlay.keys()]);
          const required = latestProps.requirements[section];
          if (!required || required.every(bundle => loaded.has(bundle)) || current.attemptedPreloads.has(section)) continue;
          current.attemptedPreloads.add(section);
          const controller = new AbortController();
          current.controllers.add(controller);
          const params = new URL(window.location.href).searchParams;
          const promise = loadSection({
            section,
            account: params.get("account") ?? latestProps.account ?? undefined,
            property: params.get("property") ?? undefined,
            preload: true
          }, controller.signal);
          const flight = { section, scope: scheduledScope, epoch: scheduledEpoch, promise };
          current.preloadFlight = flight;
          try {
            const result = await promise;
            if (current.scope !== flight.scope || current.epoch !== flight.epoch ||
                !("status" in result) || result.status !== "ready") continue;
            for (const bundle of result.data.loadedBundles) {
              current.overlay.delete(bundle);
              current.overlay.set(bundle, result.data);
            }
            redraw(value => value + 1);
          } catch {
            // Preload failures are intentionally silent; a later click uses the normal fallback.
          } finally {
            current.controllers.delete(controller);
            if (current.preloadFlight === flight) current.preloadFlight = null;
          }
        }
      };
      void preload();
    };
    current.preloadIdle = globalThis.setTimeout(run, delay) as unknown as number;
  }, [cancelScheduledPreload]);

  const navigationParams = () => new URL(
    state.current.pendingUrl ?? window.location.href, window.location.origin
  ).searchParams;
  const data: Partial<OwnerSectionData> = Object.assign({}, ...cache.overlay.values());
  return { data, loading: cache.loading, navigate, fullNavigate, navigationParams, preloadSection, cancelScheduledPreload };
}

export const OwnerSectionCacheContext = createContext<ReturnType<typeof useOwnerSectionCache> | null>(null);
