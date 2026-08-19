"use client";
import { useMemo, useRef, useState } from "react";
import { FileText, Trash2, UploadCloud, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { deleteDocument, uploadDocuments } from "@/lib/api";
import type { DocumentInfo } from "@/lib/types";

const ACCEPT =
  ".pdf,.docx,.pptx,.xlsx,.xls,.csv,.tsv,.json,.html,.htm,.md,.markdown,.txt,.rst,.log," +
  ".png,.jpg,.jpeg,.webp,.gif,.bmp," +
  ".py,.js,.ts,.tsx,.jsx,.java,.go,.rb,.c,.cpp,.cs,.sh,.yaml,.yml,.toml,.ini,.sql";

interface Props {
  documents: DocumentInfo[];
  onChange: () => void;
  onSelect: (doc: DocumentInfo) => void;
}

export function DocumentSidebar({ documents, onChange, onSelect }: Props) {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(
    () => documents.filter((d) => d.filename.toLowerCase().includes(query.toLowerCase())),
    [documents, query]
  );

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    const list = Array.from(files);
    setBusy(true);
    const t = toast.loading(`Uploading ${list.length} file${list.length > 1 ? "s" : ""}…`);
    try {
      const res = await uploadDocuments(list);
      onChange();
      toast.dismiss(t);
      if (res.uploaded.length)
        toast.success(`Added ${res.uploaded.length} document${res.uploaded.length > 1 ? "s" : ""}`);
      res.failed.forEach((f) => toast.error(`Couldn't read ${f.filename}`));
    } catch {
      toast.dismiss(t);
      toast.error("Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    await deleteDocument(id);
    onChange();
    toast.success(`Removed ${name}`);
  }

  return (
    <aside className="flex h-full w-full flex-col gap-4">
      <Card
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed p-6 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
        )}
      >
        {busy ? (
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        ) : (
          <UploadCloud className="h-7 w-7 text-primary" />
        )}
        <div className="text-sm font-medium">Add documents</div>
        <div className="text-xs text-muted-foreground">
          Drag &amp; drop or click · PDF, Word, PowerPoint, Excel, CSV &amp; more
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </Card>

      <Card className="flex min-h-0 flex-1 flex-col p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Your documents</h2>
          <Badge variant="muted">{documents.length}</Badge>
        </div>

        {documents.length > 3 && (
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search files"
              className="h-9 pl-9 text-xs"
            />
          </div>
        )}

        <div className="scroll-thin -mr-2 flex-1 space-y-2 overflow-y-auto pr-2">
          {documents.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
              <FileText className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">No documents yet.</p>
              <p className="text-[11px] text-muted-foreground/70">Upload files to start asking questions.</p>
            </div>
          )}
          {filtered.map((d) => (
            <div
              key={d.doc_id}
              onClick={() => onSelect(d)}
              className="group flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-background/60 px-3 py-2 transition-colors hover:border-primary/50 hover:bg-accent"
              title="View summary & suggested questions"
            >
              <FileText className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{d.filename}</p>
                <p className="text-[11px] text-muted-foreground">{d.chunks} section{d.chunks > 1 ? "s" : ""} · view insights</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(d.doc_id, d.filename); }}
                className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                aria-label="Remove document"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </Card>
    </aside>
  );
}
