"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { SendHorizonal, Sparkles, FileText, ListChecks, HelpCircle, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { MessageBubble } from "@/components/message-bubble";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { streamChat } from "@/lib/api";
import type { ChatMessage, Source, TraceStep } from "@/lib/types";

const SUGGESTIONS = [
  { icon: FileText, text: "Summarize this document" },
  { icon: ListChecks, text: "What are the key points?" },
  { icon: HelpCircle, text: "What is this document about?" },
  { icon: Wand2, text: "List any action items or deadlines" },
];

const STORAGE_KEY = "documind.conversation.v1";
let idCounter = 0;
const nextId = () => `m${Date.now()}_${++idCounter}`;

export function ChatPanel({
  onActivity,
  newChatNonce,
}: {
  onActivity?: () => void;
  newChatNonce?: number;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const hydrated = useRef(false);

  // load persisted conversation
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setMessages(JSON.parse(saved));
    } catch {}
    hydrated.current = true;
  }, []);

  // persist conversation
  useEffect(() => {
    if (hydrated.current) localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  // "New chat" from header
  useEffect(() => {
    if (newChatNonce === undefined || !hydrated.current) return;
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  }, [newChatNonce]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const autoGrow = useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }, []);

  const runQuery = useCallback(
    async (q: string) => {
      const botId = nextId();
      const botMsg: ChatMessage = { id: botId, role: "assistant", content: "", trace: [], sources: [], streaming: true };
      setMessages((m) => [...m, botMsg]);
      setBusy(true);

      const trace: TraceStep[] = [];
      let content = "";

      await streamChat(q, {
        onTrace: (step) => {
          trace.push(step);
          setMessages((m) => m.map((msg) => (msg.id === botId ? { ...msg, trace: [...trace] } : msg)));
        },
        onToken: (tok) => {
          content += tok;
          setMessages((m) => m.map((msg) => (msg.id === botId ? { ...msg, content } : msg)));
        },
        onSources: (sources: Source[]) =>
          setMessages((m) => m.map((msg) => (msg.id === botId ? { ...msg, sources } : msg))),
        onDone: () => {
          setMessages((m) => m.map((msg) => (msg.id === botId ? { ...msg, streaming: false } : msg)));
          setBusy(false);
          onActivity?.();
        },
        onError: () => {
          setMessages((m) =>
            m.map((msg) =>
              msg.id === botId
                ? { ...msg, streaming: false, content: content || "Sorry — I couldn't reach the service. Please try again." }
                : msg
            )
          );
          setBusy(false);
          toast.error("Connection error. Is the service running?");
        },
      });
    },
    [onActivity]
  );

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    requestAnimationFrame(autoGrow);
    setMessages((m) => [...m, { id: nextId(), role: "user", content: q }]);
    await runQuery(q);
  }

  async function regenerate() {
    if (busy) return;
    // find last user message, drop the trailing assistant message, re-run
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    setMessages((m) => {
      const copy = [...m];
      if (copy[copy.length - 1]?.role === "assistant") copy.pop();
      return copy;
    });
    await runQuery(lastUser.content);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <div ref={scrollRef} className="scroll-thin flex-1 space-y-5 overflow-y-auto p-5">
        {messages.length === 0 ? (
          <EmptyState onPick={send} />
        ) : (
          messages.map((m, i) => (
            <MessageBubble
              key={m.id}
              message={m}
              isLast={i === messages.length - 1}
              onRegenerate={regenerate}
            />
          ))
        )}
      </div>

      <div className="border-t border-border bg-card/50 p-3">
        <form
          onSubmit={(e) => { e.preventDefault(); send(input); }}
          className="flex items-end gap-2"
        >
          <Textarea
            ref={taRef}
            rows={1}
            value={input}
            onChange={(e) => { setInput(e.target.value); autoGrow(); }}
            onKeyDown={onKeyDown}
            placeholder="Ask anything about your documents…"
            disabled={busy}
            className="max-h-[140px] min-h-[44px]"
          />
          <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Send" className="h-11 w-11 shrink-0">
            <SendHorizonal className="h-5 w-5" />
          </Button>
        </form>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          DocuMind can make mistakes. Answers are drawn from your uploaded documents.
        </p>
      </div>
    </Card>
  );
}

function EmptyState({ onPick }: { onPick: (t: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Sparkles className="h-7 w-7" />
      </div>
      <div>
        <h2 className="text-xl font-semibold">How can I help with your documents?</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Upload files on the left, then ask anything. Every answer comes with citations.
        </p>
      </div>
      <div className="grid w-full max-w-md grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map(({ icon: Icon, text }) => (
          <button
            key={text}
            onClick={() => onPick(text)}
            className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
          >
            <Icon className="h-4 w-4 shrink-0 text-primary" />
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
