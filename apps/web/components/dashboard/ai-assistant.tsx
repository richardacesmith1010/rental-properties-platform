"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SendHorizontal, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DomusLogo } from "@/components/shared/domus-logo";
import { cn } from "@/lib/format";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AiAssistantProps {
  accountId: string;
  ownerName?: string;
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
      <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.3s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.15s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-400" />
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
  const triggerRef = useRef<HTMLButtonElement | null>(null);
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
    setIsOpen(false);
    window.requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  }, []);

  const sendMessage = useCallback(
    async (rawValue: string) => {
      const trimmed = rawValue.trim();
      if (!trimmed || isLoading) {
        return;
      }

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
      }
    },
    [accountId, isLoading, messages]
  );

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
      {!isOpen ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+9rem)] right-3 z-30 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-700 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:shadow-xl sm:bottom-24 sm:right-6"
          title={helperText}
          aria-label="Ask Domus"
        >
          <Sparkles className="h-4 w-4" />
          <span>Ask Domus</span>
        </button>
      ) : null}

      {isOpen ? (
        <section
          role="dialog"
          aria-label="Ask Domus"
          className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] left-4 right-4 z-30 flex h-[min(480px,calc(100vh-9rem))] flex-col rounded-3xl border border-border bg-card shadow-2xl sm:bottom-24 sm:left-auto sm:right-6 sm:w-[360px]"
        >
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
                      onClick={() => void sendMessage(prompt)}
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
                          ? "rounded-2xl rounded-br-sm bg-violet-600 text-white"
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
              void sendMessage(input);
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
                    void sendMessage(input);
                  }
                }}
                placeholder="Ask anything about your properties..."
                className="min-h-11 flex-1 resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                rows={1}
                disabled={isLoading}
              />
              <Button
                type="submit"
                size="icon"
                className="h-11 w-11 rounded-full"
                disabled={input.trim().length === 0 || isLoading}
                title="Send your question"
                aria-label="Send"
              >
                <SendHorizontal className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </section>
      ) : null}
    </>
  );
}
