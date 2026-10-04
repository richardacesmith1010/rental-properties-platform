"use client";

import type { OwnerBundleId } from "@/app/owner/owner-page-data";
import type { OwnerSectionData, OwnerSectionInput, OwnerSectionResult } from "@/app/actions/owner-section-data";
import { createContext, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ownerWorkflowModeMeta, type OwnerWorkflowMode } from "./dashboard-config";

export interface OwnerSectionCacheProps {
  loadedBundles: OwnerBundleId[];
  requirements: Record<string, OwnerBundleId[]>;
  account: string | null;
  mode?: string;
  property: string | null;
  loadSection: (input: OwnerSectionInput) => Promise<OwnerSectionResult>;
}

export function resolveOwnerMode(mode: string | null): OwnerWorkflowMode {
  return mode && Object.prototype.hasOwnProperty.call(ownerWorkflowModeMeta, mode)
    ? mode as OwnerWorkflowMode : "daily_ops";
}

function ownerScope(account: string | null, mode: string | null, property: string | null) {
  return JSON.stringify([account, resolveOwnerMode(mode), property || null]);
}

export function useOwnerSectionCache(props: OwnerSectionCacheProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, redraw] = useState(0);
  const serverScope = ownerScope(props.account, props.mode ?? null, props.property);
  const scope = ownerScope(searchParams.get("account") ?? props.account,
    searchParams.get("mode"), searchParams.get("property"));
  const state = useRef({
    server: props.loadedBundles, scope, epoch: 0, request: 0, pendingUrl: null as string | null,
    overlay: new Map<OwnerBundleId, OwnerSectionData>(), loading: false, waitingForServer: false,
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
    cache.epoch++;
    cache.overlay.clear();
    cache.loading = false;
    cache.waitingForServer = false;
    cache.pendingUrl = null;
  } else if (cache.scope !== scope && !cache.waitingForServer) {
    cache.scope = scope;
    cache.epoch++;
    cache.overlay.clear();
    cache.loading = true;
    cache.waitingForServer = true;
  }

  const cancelScheduledPreload = useCallback(() => {
    const current = state.current;
    if (current.preloadIdle === null) return;
    if (typeof window.requestIdleCallback === "function") window.cancelIdleCallback(current.preloadIdle);
    else globalThis.clearTimeout(current.preloadIdle);
    current.preloadIdle = null;
  }, []);

  const invalidate = useCallback(() => {
    const current = state.current;
    cancelScheduledPreload();
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

  useEffect(() => cancelScheduledPreload, [cancelScheduledPreload]);

  const navigate = useCallback((url: string, section: string) => {
    const next = new URL(url, window.location.origin);
    const nextScope = ownerScope(next.searchParams.get("account") ?? props.account,
      next.searchParams.get("mode"), next.searchParams.get("property"));
    const current = state.current;
    if (current.waitingForServer || nextScope !== current.scope || nextScope !== serverScope) {
      fullNavigate(url);
      return;
    }
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
    const requestPromise = preloadFlight?.section === section &&
      preloadFlight.scope === current.scope && preloadFlight.epoch === epoch
      ? preloadFlight.promise
      : props.loadSection({
        section, account: next.searchParams.get("account") ?? props.account ?? undefined,
        mode: next.searchParams.get("mode") ?? undefined,
        property: next.searchParams.get("property") ?? undefined
      });
    void requestPromise.then(result => {
      if (!isCurrent()) return;
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
      if (!isCurrent()) return;
      invalidate();
      router.refresh();
    });
  }, [fullNavigate, invalidate, props, router, serverScope]);

  const preloadNeighbours = useCallback((activeSection: string, sectionIds: string[]) => {
    const current = state.current;
    cancelScheduledPreload();
    const scheduledScope = current.scope;
    const scheduledEpoch = current.epoch;
    const run = () => {
      current.preloadIdle = null;
      const connection = navigator as Navigator & { connection?: { saveData?: boolean } };
      if (connection.connection?.saveData || document.visibilityState === "hidden" || current.loading ||
          current.waitingForServer || current.scope !== scheduledScope || current.epoch !== scheduledEpoch) return;
      const existingFlight = current.preloadFlight;
      if (existingFlight) {
        void existingFlight.promise.catch(() => undefined).then(run);
        return;
      }
      const activeIndex = sectionIds.indexOf(activeSection);
      if (activeIndex < 0 || sectionIds.length < 2) return;
      const candidates = [
        sectionIds[(activeIndex + 1) % sectionIds.length],
        sectionIds[(activeIndex - 1 + sectionIds.length) % sectionIds.length]
      ].filter((section, index, values) => values.indexOf(section) === index);
      const preload = async () => {
        for (const section of candidates) {
          if (connection.connection?.saveData || document.visibilityState === "hidden" || current.loading ||
              current.waitingForServer || current.scope !== scheduledScope ||
              current.epoch !== scheduledEpoch) return;
          const latestProps = propsRef.current;
          const loaded = new Set([...latestProps.loadedBundles, ...current.overlay.keys()]);
          const required = latestProps.requirements[section];
          if (!required || required.every(bundle => loaded.has(bundle))) continue;
          const params = new URL(window.location.href).searchParams;
          const promise = latestProps.loadSection({
            section,
            account: params.get("account") ?? latestProps.account ?? undefined,
            mode: params.get("mode") ?? undefined,
            property: params.get("property") ?? undefined,
            preload: true
          });
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
            if (current.preloadFlight === flight) current.preloadFlight = null;
          }
        }
      };
      void preload();
    };
    current.preloadIdle = typeof window.requestIdleCallback === "function"
      ? window.requestIdleCallback(run)
      : globalThis.setTimeout(run, 300) as unknown as number;
  }, [cancelScheduledPreload]);

  const navigationParams = () => new URL(
    state.current.pendingUrl ?? window.location.href, window.location.origin
  ).searchParams;
  const data: Partial<OwnerSectionData> = Object.assign({}, ...cache.overlay.values());
  return { data, loading: cache.loading, navigate, fullNavigate, navigationParams, preloadNeighbours };
}

export const OwnerSectionCacheContext = createContext<ReturnType<typeof useOwnerSectionCache> | null>(null);
