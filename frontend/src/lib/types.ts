export interface DocumentInfo {
  doc_id: string;
  filename: string;
  chunks: number;
}

export interface Health {
  status: string;
  provider: string;
  embedding_model: string;
  documents: number;
  chunks: number;
}

export interface Source {
  doc_id?: string;
  filename: string;
  chunk_index: number;
  score: number;
  snippet: string;
}

export interface TraceStep {
  type: "tool_call" | "tool_result";
  name: string;
  detail: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  trace?: TraceStep[];
  sources?: Source[];
  streaming?: boolean;
}
