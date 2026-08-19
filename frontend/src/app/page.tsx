"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Header } from "@/components/header";
import { DocumentSidebar } from "@/components/document-sidebar";
import { ChatPanel } from "@/components/chat-panel";
import { InsightsPanel } from "@/components/insights-panel";
import { getDocuments } from "@/lib/api";
import type { DocumentInfo } from "@/lib/types";

export default function Home() {
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [newChatNonce, setNewChatNonce] = useState(0);
  const [insightsDoc, setInsightsDoc] = useState<DocumentInfo | null>(null);
  const [injected, setInjected] = useState<{ text: string; nonce: number }>({ text: "", nonce: 0 });
  const nonce = useRef(0);

  const refresh = useCallback(async () => {
    try {
      setDocuments(await getDocuments());
    } catch {
      /* service not up yet — UI still renders */
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function askQuestion(text: string) {
    nonce.current += 1;
    setInjected({ text, nonce: nonce.current });
    setInsightsDoc(null);
  }

  return (
    <div className="app-bg flex min-h-screen flex-col">
      <Header onNewChat={() => setNewChatNonce((n) => n + 1)} />
      <main className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 gap-5 p-4 sm:p-6 lg:grid-cols-[320px_1fr]">
        <div className="order-2 h-[calc(100vh-8rem)] lg:order-1">
          <DocumentSidebar documents={documents} onChange={refresh} onSelect={setInsightsDoc} />
        </div>
        <div className="order-1 h-[calc(100vh-8rem)] lg:order-2">
          <ChatPanel onActivity={refresh} newChatNonce={newChatNonce} injected={injected} />
        </div>
      </main>

      {insightsDoc && (
        <InsightsPanel doc={insightsDoc} onClose={() => setInsightsDoc(null)} onAsk={askQuestion} />
      )}
    </div>
  );
}
