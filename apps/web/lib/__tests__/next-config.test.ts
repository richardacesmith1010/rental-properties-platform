// @vitest-environment node
import { expect, it } from "vitest";
import { pathToFileURL } from "node:url";

it("keeps stale times and allows a 4 MB action body", async () => {
  const configUrl: string = pathToFileURL(`${process.cwd()}/next.config.mjs`).href;
  const { default: config } = await import(configUrl);
  expect(config.experimental.serverActions.bodySizeLimit).toBe("4mb");
  expect(config.experimental.staleTimes).toEqual({ dynamic: 30, static: 300 });
});
