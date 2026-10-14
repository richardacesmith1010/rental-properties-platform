import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FaceIdSettings } from "../face-id-settings";

const postMessage = vi.fn();
function respond(detail: Record<string, unknown>, requestId = postMessage.mock.lastCall?.[0].requestId) {
  act(() => { window.dispatchEvent(new CustomEvent("domus-face-id", { detail: { requestId, ...detail } })); });
}
function ready(kind = "faceId", enabled = false) {
  render(<FaceIdSettings />);
  respond({ available: true, enabled, kind });
}

describe("FaceIdSettings", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    postMessage.mockReset();
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("iPhone DomusApp/1");
    Object.defineProperty(window, "webkit", { configurable: true, value: { messageHandlers: { domusFaceId: { postMessage } } } });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "webkit");
  });
  it("renders nothing without native user agent", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Safari");
    expect(render(<FaceIdSettings />).container).toBeEmptyDOMElement();
    expect(postMessage).not.toHaveBeenCalled();
  });
  it("renders nothing without the handler", () => {
    Reflect.deleteProperty(window, "webkit");
    expect(render(<FaceIdSettings />).container).toBeEmptyDOMElement();
  });
  it("renders nothing when biometrics are unavailable", () => {
    const { container } = render(<FaceIdSettings />);
    respond({ available: false, enabled: false, kind: "none" });
    expect(container).toBeEmptyDOMElement();
  });
  it.each(["faceId", "touchId"])("uses the correct %s label and a 44px switch", (kind) => {
    ready(kind);
    const label = kind === "faceId" ? "Open Domus with Face ID" : "Open Domus with Touch ID";
    const toggle = screen.getByRole("switch", { name: label });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle.className).toContain("min-h-11");
    expect(toggle.className).toContain("min-w-11");
  });
  it("posts correlated get, enable and disable; changes only after the latest reply", () => {
    ready();
    const first = postMessage.mock.calls[0][0];
    expect(first).toEqual({ action: "get", requestId: expect.any(String) });
    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);
    const enable = postMessage.mock.lastCall?.[0];
    expect(enable.action).toBe("enable");
    expect(enable.requestId).not.toBe(first.requestId);
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute("aria-checked", "false");
    respond({ available: true, enabled: true, kind: "faceId" }, first.requestId);
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute("aria-checked", "false");
    respond({ available: true, enabled: true, kind: "faceId" }, enable.requestId);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(toggle).not.toBeDisabled();
    fireEvent.click(toggle);
    expect(postMessage.mock.lastCall?.[0].action).toBe("disable");
    expect(toggle).toHaveAttribute("aria-checked", "true");
    respond({ available: true, enabled: false, kind: "faceId" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });
  it.each(["faceId", "touchId"])("shows the %s timeout after five seconds and permits retry", (kind) => {
    ready(kind);
    fireEvent.click(screen.getByRole("switch"));
    act(() => vi.advanceTimersByTime(4999));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("status")).toHaveTextContent(`${kind === "touchId" ? "Touch ID" : "Face ID"} didn't respond. Try again.`);
    expect(screen.getByRole("switch")).not.toBeDisabled();
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  it("initial get timeout offers a retry and ignores expired replies", () => {
    render(<FaceIdSettings />);
    const expired = postMessage.mock.lastCall?.[0].requestId;
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByRole("status")).toHaveTextContent("Face ID didn't respond. Try again.");
    respond({ available: true, enabled: true, kind: "faceId" }, expired);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
    fireEvent.click(screen.getByRole("switch"));
    expect(postMessage.mock.lastCall?.[0].action).toBe("get");
  });
  it("ignores malformed replies and removes timers on unmount", () => {
    const { unmount } = render(<FaceIdSettings />);
    respond({ available: "true", enabled: false, kind: "faceId" });
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("ignores unsolicited null correlation after a completed request", () => {
    ready();
    respond({ requestId: null, available: true, enabled: true, kind: "faceId" });
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });
});
