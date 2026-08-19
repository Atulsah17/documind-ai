"use client";
import { Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

export function Header({ onNewChat }: { onNewChat?: () => void }) {
  return (
    <header className="glass sticky top-0 z-20 border-b border-border">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <h1 className="text-lg font-bold tracking-tight">DocuMind</h1>
            <p className="text-xs text-muted-foreground">Chat with your documents</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onNewChat}>
            <Plus className="h-4 w-4" /> New chat
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
