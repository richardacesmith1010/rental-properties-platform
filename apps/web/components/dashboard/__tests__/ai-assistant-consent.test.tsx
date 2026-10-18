import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiAssistant } from "@/components/dashboard/ai-assistant";
import { OPEN_AI_ASSISTANT_EVENT } from "@/components/help-menu";

const getConsentMock = vi.hoisted(() => vi.fn());
const setConsentMock = vi.hoisted(() => vi.fn());
vi.mock("@/app/actions/ai-consent", () => ({
  getAskDomusConsent: getConsentMock,
  setAskDomusConsent: setConsentMock
}));

const prompts = [
  "Who hasn't paid this month?", "Any open maintenance issues?",
  "What's my total overdue balance?", "When does my tenant's lease end?"
];

function openAssistant() {
  render(<AiAssistant accountId="account-a" />);
  act(() => window.dispatchEvent(new CustomEvent(OPEN_AI_ASSISTANT_EVENT)));
}

describe("Ask Domus consent sheet", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
    global.fetch = fetchMock;
    getConsentMock.mockResolvedValue({ enabled: false });
    setConsentMock.mockResolvedValue({ success: true });
    fetchMock.mockResolvedValue(new Response("Done", { status: 200 }));
  });

  it("send button clears the help button", () => {
    openAssistant();
    const sendButton = screen.getByRole("button", { name: "Send" });
    expect(sendButton.closest("form")).toHaveClass("pr-16");
  });

  it.each(["button", "Enter"])("shows consent before a typed %s send", async (entry) => {
    openAssistant();
    const input = screen.getByPlaceholderText("Ask anything about your properties...");
    fireEvent.change(input, { target: { value: "Who paid?" } });
    if (entry === "button") fireEvent.click(screen.getByRole("button", { name: "Send" }));
    else fireEvent.keyDown(input, { key: "Enter" });
    expect(await screen.findByRole("dialog", { name: "Ask Domus uses AI" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(prompts)("shows consent before starter prompt %s", async (prompt) => {
    openAssistant();
    fireEvent.click(screen.getByRole("button", { name: prompt }));
    expect(await screen.findByRole("dialog", { name: "Ask Domus uses AI" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing if consent saving fails", async () => {
    setConsentMock.mockResolvedValue({ success: false, error: "We could not save this. Please try again." });
    openAssistant();
    fireEvent.click(screen.getByRole("button", { name: prompts[0] }));
    fireEvent.click(await screen.findByRole("button", { name: "Allow" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not save this. Please try again.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("saves once and sends one pending message after a rapid double tap", async () => {
    let resolveSave!: (value: { success: boolean }) => void;
    setConsentMock.mockImplementation(() => new Promise((resolve) => { resolveSave = resolve; }));
    openAssistant();
    fireEvent.click(screen.getByRole("button", { name: prompts[0] }));
    const allow = await screen.findByRole("button", { name: "Allow" });
    fireEvent.click(allow);
    fireEvent.click(allow);
    expect(setConsentMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => resolveSave({ success: true }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
});
