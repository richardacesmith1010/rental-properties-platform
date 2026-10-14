// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../route";
import { config } from "@/middleware";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it("229 §8.1 AASA is identical anonymously and for another user, with exactly the app path", async () => {
  vi.stubEnv("APPLE_APP_ID", "SYNTHETIC1.com.domusbase.app");
  const bodies = [];
  for (const cookie of ["", "sb-synthetic-auth-token=synthetic-other-user"]) {
    const request = new NextRequest("https://domusbase.com/.well-known/apple-app-site-association", { headers: { cookie } });
    const response = await (GET as (request?: NextRequest) => Response)(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600");
    expect(response.headers.has("Location")).toBe(false);
    bodies.push(await response.json());
  }
  expect(bodies[0]).toEqual({ applinks: { details: [{ appIDs: ["SYNTHETIC1.com.domusbase.app"],
    components: [{ "/": "/owner/bank/oauth-app", comment: "Plaid OAuth return" }] }] } });
  expect(bodies[1]).toEqual(bodies[0]);
});
it.each([undefined, "", "bad.com.domusbase.app", "SYNTHETIC1.other.app", "synthetic1.com.domusbase.app"])
  ("229 §8.1 missing or invalid app ID %s returns 404", (id) => {
    vi.stubEnv("APPLE_APP_ID", id);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(GET().status).toBe(404);
    expect(log).toHaveBeenCalledWith("aasa_app_id_missing");
  });
it("229 §8.1 middleware matcher excludes well-known but retains owner and other routes", () => {
  const matcher = new RegExp("^" + config.matcher[0] + "$");
  expect(matcher.test("/.well-known/apple-app-site-association")).toBe(false);
  expect(matcher.test("/.well-known/anything")).toBe(false);
  for (const path of ["/owner/bank", "/owner/bank/oauth", "/owner/bank/oauth-app", "/login"]) {
    expect(matcher.test(path)).toBe(true);
  }
});
