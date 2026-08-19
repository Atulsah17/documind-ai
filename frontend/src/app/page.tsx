"use client";
import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/header";
import { DocumentSidebar } from "@/components/document-sidebar";
import { ChatPanel } from "@/components/chat-panel";
import { getDocuments } from "@/lib/api";
import type { DocumentInfo } from "@/lib/types";

export default function Home() {
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [newChatNonce, setNewChatNonce] = useState(0);

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

  return (
    <div className="app-bg flex min-h-screen flex-col">
      <Header onNewChat={() => setNewChatNonce((n) => n + 1)} />
      <main className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 gap-5 p-4 sm:p-6 lg:grid-cols-[320px_1fr]">
        <div className="order-2 h-[calc(100vh-8rem)] lg:order-1">
          <DocumentSidebar documents={documents} onChange={refresh} />
        </div>
        <div className="order-1 h-[calc(100vh-8rem)] lg:order-2">
          <ChatPanel onActivity={refresh} newChatNonce={newChatNonce} />
        </div>
      </main>
    </div>
  );
}
