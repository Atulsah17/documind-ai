"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, FileText, Sparkles, MessageSquarePlus, Loader2 } from "lucide-react";
import { getInsights, type Insights } from "@/lib/api";
import type { DocumentInfo } from "@/lib/types";

interface Props {
  doc: DocumentInfo;
  onClose: () => void;
  onAsk: (question: string) => void;
}

export function InsightsPanel({ doc, onClose, onAsk }: Props) {
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    getInsights(doc.doc_id)
      .then((d) => active && setData(d))
      .catch(() => active && setError(true));
    return () => { active = false; };
  }, [doc.doc_id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      >
        {/* header */}
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold">{doc.filename}</h3>
              <p className="text-xs text-muted-foreground">Document insights</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-4">
          {/* summary */}
          <section>
            <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" /> Summary
            </h4>
            {error ? (
              <p className="text-sm text-destructive">Could not generate insights. Please try again.</p>
            ) : !data ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Reading the document…
              </div>
            ) : (
              <p className="text-sm leading-relaxed">{data.summary}</p>
            )}
          </section>

          {/* suggested questions */}
          {data && (
            <section>
              <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <MessageSquarePlus className="h-3.5 w-3.5" /> Ask about this document
              </h4>
              <div className="space-y-2">
                {data.questions.map((q) => (
                  <button
                    key={q}
                    onClick={() => onAsk(q)}
                    className="flex w-full items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:border-primary/50 hover:bg-accent"
                  >
                    <MessageSquarePlus className="h-4 w-4 shrink-0 text-primary" />
                    {q}
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </motion.div>
    </div>
  );
}
