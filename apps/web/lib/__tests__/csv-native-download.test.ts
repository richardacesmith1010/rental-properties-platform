import { afterEach, expect, it, vi } from "vitest";
import { downloadReportCsv } from "@/lib/csv-export-reports";
import { exportChargesCSV, exportExpensesCSV } from "@/lib/csv-export";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("sends CSV text and the requested filename to the native handler", () => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("DomusApp/1");
  const postMessage = vi.fn();
  vi.stubGlobal("webkit", { messageHandlers: { domusShareCsv: { postMessage } } });
  downloadReportCsv("rent.csv", '"Month","Rent"\n"October","500"');
  expect(postMessage).toHaveBeenCalledWith({ filename: "rent.csv", csv: '"Month","Rent"\n"October","500"' });
  exportChargesCSV([]);
  exportExpensesCSV([]);
  expect(postMessage).toHaveBeenCalledTimes(3);
});

it("keeps the normal browser Blob download path unchanged", () => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Safari");
  const createObjectURL = vi.fn().mockReturnValue("blob:test");
  const revokeObjectURL = vi.fn();
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  downloadReportCsv("rent.csv", "Month,Rent");
  expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
  expect(click).toHaveBeenCalledOnce();
  const anchor = click.mock.instances[0] as HTMLAnchorElement;
  expect(anchor.download).toBe("rent.csv");
  expect(anchor.href).toBe("blob:test");
  expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
});

it("shows a useful error when the native handler is missing", () => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("DomusApp/1");
  vi.stubGlobal("webkit", undefined);
  const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
  downloadReportCsv("rent.csv", "Month,Rent");
  expect(alert).toHaveBeenCalledWith("Download failed. Try again.");
});
