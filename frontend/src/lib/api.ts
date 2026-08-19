import type { DocumentInfo, Health, Source, TraceStep } from "./types";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";

export async function getHealth(): Promise<Health> {
  const r = await fetch(`${API_BASE}/api/health`, { cache: "no-store" });
  if (!r.ok) throw new Error("health check failed");
  return r.json();
}

export async function getDocuments(): Promise<DocumentInfo[]> {
  const r = await fetch(`${API_BASE}/api/documents`, { cache: "no-store" });
  if (!r.ok) throw new Error("failed to list documents");
  return r.json();
}

export async function uploadDocument(file: File): Promise<DocumentInfo> {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch(`${API_BASE}/api/upload`, { method: "POST", body: fd });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? "upload failed");
  return r.json();
}

export interface BatchUploadResult {
  uploaded: DocumentInfo[];
  failed: { filename: string; error: string }[];
}

/** Upload many files in one request; returns per-file success/failure. */
export async function uploadDocuments(files: File[]): Promise<BatchUploadResult> {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  const r = await fetch(`${API_BASE}/api/upload-batch`, { method: "POST", body: fd });
  if (!r.ok) throw new Error("batch upload failed");
  return r.json();
}

export async function getSupportedTypes(): Promise<string[]> {
  try {
    const r = await fetch(`${API_BASE}/api/supported-types`, { cache: "no-store" });
    if (!r.ok) return [];
    return (await r.json()).extensions ?? [];
  } catch {
    return [];
  }
}

export async function deleteDocument(docId: string): Promise<void> {
  const r = await fetch(`${API_BASE}/api/documents/${docId}`, { method: "DELETE" });
  if (!r.ok) throw new Error("delete failed");
}

export interface StreamHandlers {
  onTrace?: (step: TraceStep) => void;
  onToken?: (token: string) => void;
  onSources?: (sources: Source[]) => void;
  onDone?: () => void;
  onError?: (err: unknown) => void;
}

/**
 * POST /api/chat and parse the Server-Sent-Events stream.
 * (EventSource only supports GET, so we read the body stream manually.)
 */
export async function streamChat(
  message: string,
  handlers: StreamHandlers,
  signal?: AbortSignal
): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
      signal,
    });
    if (!res.body) throw new Error("no response body");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        let event = "message";
        let data = "";
        for (const line of frame.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) data += line.slice(5).trim();
        }
        if (!data) continue;
        const payload = safeParse(data);
        if (event === "trace")
          handlers.onTrace?.({ type: payload.type as TraceStep["type"], name: payload.name ?? "", detail: payload.detail ?? "" });
        else if (event === "token") handlers.onToken?.(payload.content ?? "");
        else if (event === "sources") handlers.onSources?.((payload.sources as Source[]) ?? []);
        else if (event === "done") handlers.onDone?.();
      }
    }
    handlers.onDone?.();
  } catch (err) {
    if ((err as Error).name !== "AbortError") handlers.onError?.(err);
  }
}

interface SsePayload {
  content?: string;
  sources?: Source[];
  type?: string;
  name?: string;
  detail?: string;
}

function safeParse(s: string): SsePayload {
  try {
    return JSON.parse(s) as SsePayload;
  } catch {
    return {};
  }
}
