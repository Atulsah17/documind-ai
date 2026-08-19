"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { X, FileText, Loader2 } from "lucide-react";
import { getDocText } from "@/lib/api";
import type { Source } from "@/lib/types";

export function SourceViewer({ source, onClose }: { source: Source; onClose: () => void }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const markRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!source.doc_id) { setError(true); return; }
    let active = true;
    getDocText(source.doc_id)
      .then((t) => active && setText(t))
      .catch(() => active && setError(true));
    return () => { active = false; };
  }, [source.doc_id]);

  useEffect(() => {
    if (text) markRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [text]);

  // split the full text around the cited snippet to highlight it
  const parts = (() => {
    if (!text) return null;
    const snip = source.snippet.trim();
    const idx = text.indexOf(snip);
    if (idx === -1) {
      // fallback: match on the first line of the snippet
      const head = snip.split("\n")[0].slice(0, 60);
      const i2 = head ? text.indexOf(head) : -1;
      if (i2 === -1) return { before: text, hit: "", after: "" };
      return { before: text.slice(0, i2), hit: text.slice(i2, i2 + snip.length), after: text.slice(i2 + snip.length) };
    }
    return { before: text.slice(0, idx), hit: text.slice(idx, idx + snip.length), after: text.slice(idx + snip.length) };
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold">{source.filename}</h3>
              <p className="text-xs text-muted-foreground">Source · {(source.score * 100).toFixed(0)}% match · cited passage highlighted</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="scroll-thin overflow-y-auto p-4">
          {error ? (
            <p className="text-sm text-destructive">Couldn&apos;t load the source document.</p>
          ) : !parts ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading document…
            </div>
          ) : (
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-foreground">
              {parts.before}
              {parts.hit && (
                <mark ref={markRef} className="rounded bg-primary/25 px-0.5 text-foreground">
                  {parts.hit}
                </mark>
              )}
              {parts.after}
            </pre>
          )}
        </div>
      </motion.div>
    </div>
  );
}
