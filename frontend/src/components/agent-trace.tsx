"use client";
import { motion } from "framer-motion";
import { Check, Search, Calculator, FileStack, Sparkles } from "lucide-react";
import type { TraceStep } from "@/lib/types";

const LABELS: Record<string, { text: string; Icon: typeof Search }> = {
  doc_search: { text: "Searched your documents", Icon: Search },
  calculator: { text: "Ran a calculation", Icon: Calculator },
  list_documents: { text: "Checked your library", Icon: FileStack },
};

export function AgentTrace({ trace }: { trace: TraceStep[] }) {
  const calls = trace.filter((t) => t.type === "tool_call");
  if (!calls.length) return null;

  return (
    <div className="mb-2 space-y-1.5 rounded-xl border border-dashed border-border bg-muted/40 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" /> How I found this
      </div>
      {calls.map((step, i) => {
        const meta = LABELS[step.name] ?? { text: step.name, Icon: Search };
        const { Icon } = meta;
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="flex items-center gap-2 text-xs"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Icon className="h-3 w-3" />
            </span>
            <span className="text-foreground">{meta.text}</span>
            {hint(step) && <span className="truncate text-muted-foreground">· {hint(step)}</span>}
            <Check className="ml-auto h-3.5 w-3.5 text-emerald-500" />
          </motion.div>
        );
      })}
    </div>
  );
}

function hint(step: TraceStep): string {
  try {
    const obj = JSON.parse(step.detail);
    if (obj.query) return `"${obj.query}"`;
    if (obj.expression) return obj.expression;
  } catch {}
  return "";
}
