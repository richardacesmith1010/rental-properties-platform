"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SendHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DomusLogo } from "@/components/shared/domus-logo";
import {
  AI_ASSISTANT_AVAILABILITY_EVENT,
  OPEN_AI_ASSISTANT_EVENT
} from "@/components/help-menu";
import { cn } from "@/lib/format";
import { getAskDomusConsent, setAskDomusConsent } from "@/app/actions/ai-consent";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AiAssistantProps {
  accountId: string;
  ownerName?: string;
}

interface OpenAiAssistantEventDetail {
  trigger?: HTMLElement | null;
}

const starterPrompts = [
  "Who hasn't paid this month?",
  "Any open maintenance issues?",
  "What's my total overdue balance?",
  "When does my tenant's lease end?"
];

function LoadingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-1">
      <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--faint)] [animation-delay:-0.3s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--faint)] [animation-delay:-0.15s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--faint)]" />
    </div>
  );
}

function parseErrorMessage(value: string) {
  try {
    const parsed = JSON.parse(value) as { error?: string };
    if (typeof parsed.error === "string" && parsed.error.trim().length > 0) {
      return parsed.error;
    }
  } catch {
    // Fall through to the raw string.
  }

  return value.trim().length > 0 ? value : "Something went wrong. Try again.";
}

export function AiAssistant({ accountId, ownerName }: AiAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [checkingConsent, setCheckingConsent] = useState(false);
  const [savingConsent, setSavingConsent] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [consentError, setConsentError] = useState("");
  const pendingMessageRef = useRef<string | null>(null);
  const checkingRef = useRef(false);
  const savingRef = useRef(false);
  const sendingRef = useRef(false);
  const openerRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const helperText = useMemo(
    () =>
      ownerName?.trim()
        ? `Ask Domus about ${ownerName.trim().split(/\s+/)[0]}'s properties.`
        : "Ask Domus about your properties.",
    [ownerName]
  );

  const closePanel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
    pendingMessageRef.current = null;
    setShowConsent(false);
    setIsOpen(false);
    window.requestAnimationFrame(() => openerRef.current?.focus());
  }, []);

  useEffect(() => {
    const handleOpen = (event: Event) => {
      openerRef.current = (event as CustomEvent<OpenAiAssistantEventDetail>).detail?.trigger ?? null;
      setIsOpen(true);
    };

    document.documentElement.dataset.domusAiAssistantAvailable = "true";
    window.dispatchEvent(new CustomEvent(AI_ASSISTANT_AVAILABILITY_EVENT, { detail: true }));
    window.addEventListener(OPEN_AI_ASSISTANT_EVENT, handleOpen);
    return () => {
      delete document.documentElement.dataset.domusAiAssistantAvailable;
      window.dispatchEvent(new CustomEvent(AI_ASSISTANT_AVAILABILITY_EVENT, { detail: false }));
      window.removeEventListener(OPEN_AI_ASSISTANT_EVENT, handleOpen);
    };
  }, []);

  const sendMessage = useCallback(
    async (rawValue: string) => {
      const trimmed = rawValue.trim();
      if (!trimmed || sendingRef.current) {
        return;
      }
      sendingRef.current = true;

      const userMessage: ChatMessage = {
        role: "user",
        content: trimmed
      };
      const requestMessages = [...messages, userMessage];
      const controller = new AbortController();
      const decoder = new TextDecoder();

      abortRef.current = controller;
      setIsLoading(true);
      setInput("");
      setMessages((current) => [...current, userMessage, { role: "assistant", content: "" }]);

      try {
        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            messages: requestMessages,
            accountId: accountId || undefined
          }),
          signal: controller.signal
        });

        if (!response.ok) {
          const errorText = await response.text();
          const message = parseErrorMessage(errorText);
          setMessages((current) => [
            ...current.slice(0, -1),
            { role: "assistant", content: message }
          ]);
          return;
        }

        if (!response.body) {
          setMessages((current) => [
            ...current.slice(0, -1),
            { role: "assistant", content: "Something went wrong. Try again." }
          ]);
          return;
        }

        const reader = response.body.getReader();
        let assistantContent = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          assistantContent += decoder.decode(value, { stream: true });
          setMessages((current) => [
            ...current.slice(0, -1),
            { role: "assistant", content: assistantContent }
          ]);
        }

        if (assistantContent.trim().length === 0) {
          setMessages((current) => [
            ...current.slice(0, -1),
            { role: "assistant", content: "I don't have enough data to answer that." }
          ]);
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        console.error("AiAssistant sendMessage error:", error);
        setMessages((current) => [
          ...current.slice(0, -1),
          { role: "assistant", content: "Something went wrong. Try again." }
        ]);
      } finally {
        abortRef.current = null;
        setIsLoading(false);
        sendingRef.current = false;
      }
    },
    [accountId, messages]
  );

  const attemptSend = useCallback(async (rawValue: string) => {
    const trimmed = rawValue.trim();
    if (!trimmed || checkingRef.current || savingRef.current || sendingRef.current || pendingMessageRef.current) return;
    checkingRef.current = true;
    setCheckingConsent(true);
    setConsentError("");
    try {
      const data = await getAskDomusConsent();
      if (data.error) throw new Error(data.error);
      if (data.enabled) void sendMessage(trimmed);
      else {
        pendingMessageRef.current = trimmed;
        setShowConsent(true);
      }
    } catch (error) {
      setConsentError(error instanceof Error ? error.message : "Something went wrong. Try again.");
    } finally {
      checkingRef.current = false;
      setCheckingConsent(false);
    }
  }, [sendMessage]);

  const allowConsent = useCallback(async () => {
    if (savingRef.current || !pendingMessageRef.current) return;
    savingRef.current = true;
    setSavingConsent(true);
    setConsentError("");
    try {
      const result = await setAskDomusConsent(true);
      if (!result.success) throw new Error(result.error ?? "We could not save this. Please try again.");
      const pending = pendingMessageRef.current;
      pendingMessageRef.current = null;
      setShowConsent(false);
      if (pending) void sendMessage(pending);
    } catch (error) {
      setConsentError(error instanceof Error ? error.message : "We could not save this. Please try again.");
    } finally {
      savingRef.current = false;
      setSavingConsent(false);
    }
  }, [sendMessage]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePanel();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [closePanel, isOpen]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [isLoading, messages]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return (
    <>
      {isOpen ? (
        <section
          role="dialog"
          aria-label="Ask Domus"
          aria-describedby="ask-domus-description"
          className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] left-4 right-4 z-30 flex h-[min(480px,calc(100vh-9rem))] flex-col rounded-3xl border border-border bg-card shadow-2xl sm:bottom-24 sm:left-auto sm:right-6 sm:w-[360px]"
        >
          <p id="ask-domus-description" className="sr-only">{helperText}</p>
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <DomusLogo size="sm" />
              <div>
                <h2 className="text-sm font-semibold text-foreground">Ask Domus</h2>
                <p className="text-xs text-muted-foreground">Ask me anything about your properties.</p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full"
              onClick={closePanel}
              title="Close Ask Domus"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </header>

          <div
            className="flex-1 overflow-y-auto px-4 py-4"
            aria-live="polite"
          >
            {messages.length === 0 ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Ask me anything about your properties.</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {starterPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      className="rounded-full border border-border bg-background px-3 py-2 text-left text-sm text-foreground transition hover:bg-muted"
                      onClick={() => void attemptSend(prompt)}
                      disabled={isLoading || checkingConsent || savingConsent || showConsent}
                      title={prompt}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={cn(
                      "flex gap-2",
                      message.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    {message.role === "assistant" ? (
                      <div className="mt-1 shrink-0">
                        <DomusLogo size="sm" />
                      </div>
                    ) : null}

                    <div
                        className={cn(
                          "max-w-[85%] whitespace-pre-wrap px-4 py-2 text-sm shadow-sm",
                          message.role === "user"
                          ? "rounded-2xl rounded-br-sm bg-[var(--accent)] text-white"
                          : "rounded-2xl rounded-bl-sm bg-muted text-foreground"
                        )}
                    >
                      {message.role === "assistant" && message.content.length === 0 && isLoading ? (
                        <LoadingDots />
                      ) : (
                        message.content
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form
            className="border-t border-border px-4 py-3"
            onSubmit={(event) => {
              event.preventDefault();
              void attemptSend(input);
            }}
          >
            <label className="sr-only" htmlFor="ask-domus-input">
              Ask anything about your properties
            </label>
            <div className="flex items-end gap-2">
              <textarea
                id="ask-domus-input"
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void attemptSend(input);
                  }
                }}
                placeholder="Ask anything about your properties..."
                className="min-h-11 flex-1 resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-line)]"
                rows={1}
                disabled={isLoading || checkingConsent || savingConsent || showConsent}
              />
              <Button
                type="submit"
                size="icon"
                className="h-11 w-11 rounded-full"
                disabled={input.trim().length === 0 || isLoading || checkingConsent || savingConsent || showConsent}
                title="Send your question"
                aria-label="Send"
              >
                <SendHorizontal className="h-4 w-4" />
              </Button>
            </div>
          </form>
          {consentError && !showConsent ? <p role="alert" className="px-4 pb-2 text-sm text-[var(--crit)]">
            {consentError}</p> : null}
          {showConsent ? <div className="absolute inset-0 z-10 flex items-center justify-center rounded-3xl
            bg-[var(--surface)] p-5" role="dialog" aria-modal="true" aria-label="Ask Domus uses AI">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-[var(--ink)]">Ask Domus uses AI</h3>
              <p className="text-sm text-[var(--ink-2)]">Your question and rental details go to Anthropic, our AI provider.</p>
              <p className="text-sm text-[var(--ink-2)]">This includes homes, leases, rent, payments, and repairs.</p>
              <p className="text-sm text-[var(--ink-2)]">Anthropic uses this to write your answer.</p>
              {consentError ? <p role="alert" className="text-sm text-[var(--crit)]">{consentError}</p> : null}
              <div className="flex gap-3">
                <Button type="button" disabled={savingConsent} onClick={() => void allowConsent()}>Allow</Button>
                <Button type="button" variant="outline" disabled={savingConsent} onClick={() => {
                  pendingMessageRef.current = null;
                  setShowConsent(false);
                  setConsentError("");
                }}>Not now</Button>
              </div>
            </div>
          </div> : null}
        </section>
      ) : null}
    </>
  );
}
