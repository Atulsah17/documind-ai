"use client";
import React, { useState } from "react";
import { motion } from "framer-motion";
import { Bot, User, FileText, Copy, Check, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { AgentTrace } from "@/components/agent-trace";
import { SourceViewer } from "@/components/source-viewer";
import { cn } from "@/lib/utils";
import type { ChatMessage, Source } from "@/lib/types";

interface Props {
  message: ChatMessage;
  isLast?: boolean;
  onRegenerate?: () => void;
}

export function MessageBubble({ message, isLast, onRegenerate }: Props) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("group flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg shadow-sm",
          isUser ? "bg-secondary text-secondary-foreground" : "bg-primary text-primary-foreground"
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      <div className={cn("max-w-[80%] space-y-2", isUser && "items-end")}>
        {!isUser && message.trace && message.trace.length > 0 && (
          <AgentTrace trace={message.trace} />
        )}

        <div
          className={cn(
            "prose-chat rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm",
            isUser
              ? "rounded-tr-sm bg-primary text-primary-foreground"
              : "rounded-tl-sm border border-border bg-card"
          )}
        >
          {!isUser && message.streaming && !message.content ? (
            <TypingDots />
          ) : (
            renderContent(message.content)
          )}
        </div>

        {!isUser && message.sources && message.sources.length > 0 && (
          <SourceList sources={message.sources} />
        )}

        {/* action row (assistant, after streaming) */}
        {!isUser && !message.streaming && message.content && (
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <ActionButton onClick={copy} label="Copy">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </ActionButton>
            {isLast && onRegenerate && (
              <ActionButton onClick={onRegenerate} label="Regenerate">
                <RotateCcw className="h-3.5 w-3.5" />
              </ActionButton>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function SourceList({ sources }: { sources: Source[] }) {
  const [viewing, setViewing] = useState<Source | null>(null);
  return (
    <div className="flex flex-wrap gap-1.5">
      {sources.map((s, i) => (
        <button
          key={i}
          onClick={() => setViewing(s)}
          title="View the cited passage in the document"
          className="inline-flex items-center gap-1 rounded-full border border-transparent bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/70"
        >
          <FileText className="h-3 w-3" />
          {s.filename}
          <span className="text-muted-foreground">· {(s.score * 100).toFixed(0)}% match</span>
        </button>
      ))}
      {viewing && <SourceViewer source={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function ActionButton({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}

function TypingDots() {
  return (
    <span className="flex items-center gap-1 py-1 text-muted-foreground">
      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-current" />
      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-current" style={{ animationDelay: "0.15s" }} />
      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-current" style={{ animationDelay: "0.3s" }} />
    </span>
  );
}

function renderContent(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={i}>{p.slice(2, -2)}</strong>
    ) : (
      <span key={i} style={{ whiteSpace: "pre-wrap" }}>{p}</span>
    )
  );
}
