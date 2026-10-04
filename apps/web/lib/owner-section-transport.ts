import type { OwnerBundleId, loadOwnerSectionBundles } from "@/app/owner/owner-page-data";

export type OwnerSectionInput = { section: string; account?: string; property?: string; mode?: string; preload?: boolean };
export type OwnerSectionData = Partial<Awaited<ReturnType<typeof loadOwnerSectionBundles>>> & {
  loadedBundles: OwnerBundleId[];
};
export type OwnerSectionResult =
  | { status: "ready"; data: OwnerSectionData }
  | { status: "role-mismatch" | "needs-onboarding" | "needs-setup" }
  | { error: string };

// Every container is tagged, so arbitrary DTO keys cannot collide with codec tags.
// DTO dates are strings; Map and undefined are present today. Special numbers can
// arise from numeric DB conversions. Other built-ins are supported defensively.
type Wire = null | boolean | string | number | { type: string; value: Wire } | Wire[];
export function encodeSectionValue(value: unknown): Wire {
  if (value === undefined) return { type: "undefined", value: null };
  if (typeof value === "number" && (!Number.isFinite(value) || Object.is(value, -0))) {
    return { type: "number", value: Object.is(value, -0) ? "-0" : String(value) };
  }
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "bigint") return { type: "bigint", value: String(value) };
  if (value instanceof Date) return { type: "date", value: encodeSectionValue(value.getTime()) };
  if (value instanceof Map) return { type: "map", value: Array.from(value, ([k, v]) => [encodeSectionValue(k), encodeSectionValue(v)]) };
  if (value instanceof Set) return { type: "set", value: Array.from(value, encodeSectionValue) };
  if (Array.isArray(value)) return { type: "array", value: Array.from(value, encodeSectionValue) };
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return { type: "object", value: Object.entries(value).map(([k, v]) => [k, encodeSectionValue(v)]) };
  }
  throw new Error("Unsupported section value.");
}

export function decodeSectionValue(wire: unknown): unknown {
  const invalid = (): never => { throw new Error("Invalid section payload."); };
  if (wire === null || typeof wire === "string" || typeof wire === "boolean") return wire;
  if (typeof wire === "number") return Number.isFinite(wire) ? wire : invalid();
  if (!wire || typeof wire !== "object" || Array.isArray(wire)) return invalid();
  const node = wire as { type: string; value: unknown };
  if (Object.keys(node).length !== 2 || !("type" in node) || !("value" in node)) return invalid();
  const { type, value } = node;
  if (type === "undefined" && value === null) return undefined;
  if (type === "number" && typeof value === "string") {
    if (value === "NaN") return NaN;
    if (value === "Infinity") return Infinity;
    if (value === "-Infinity") return -Infinity;
    if (value === "-0") return -0;
    return invalid();
  }
  if (type === "bigint" && typeof value === "string" && /^-?(0|[1-9]\d*)$/.test(value)) return BigInt(value);
  if (type === "date") {
    const time = decodeSectionValue(value);
    if (typeof time !== "number") return invalid();
    return new Date(time);
  }
  if (!Array.isArray(value)) return invalid();
  if (type === "array") return value.map(decodeSectionValue);
  if (type === "set") return new Set(value.map(decodeSectionValue));
  if (type === "map" || type === "object") {
    const keys = new Set<string>();
    const entries = value.map(entry => {
      if (!Array.isArray(entry) || entry.length !== 2) return invalid();
      if (type === "object") {
        if (typeof entry[0] !== "string" || keys.has(entry[0])) return invalid();
        keys.add(entry[0]);
      }
      return [type === "object" ? entry[0] : decodeSectionValue(entry[0]), decodeSectionValue(entry[1])] as [string, unknown];
    });
    return type === "map" ? new Map(entries) : Object.fromEntries(entries);
  }
  return invalid();
}

export function decodeOwnerSectionResult(payload: unknown): OwnerSectionResult {
  const result = payload as OwnerSectionResult;
  if (!result || typeof result !== "object") throw new Error("Invalid section response.");
  if ("error" in result && typeof result.error === "string") return result;
  if ("status" in result) {
    if (["role-mismatch", "needs-onboarding", "needs-setup"].includes(result.status)) return result;
    if (result.status === "ready") {
      const data = decodeSectionValue(result.data) as OwnerSectionData;
      if (data && Array.isArray(data.loadedBundles) && data.loadedBundles.every(id => typeof id === "string")) {
        return { status: "ready", data };
      }
    }
  }
  throw new Error("Invalid section response.");
}
