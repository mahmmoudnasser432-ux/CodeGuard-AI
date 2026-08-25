import React from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export default function Footer() {
  return (
    <footer className="border-t border-border/40 py-8 bg-background/80 mt-auto">
      <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span className="font-semibold text-foreground">CodeGuard AI</span>
          <span>© {new Date().getFullYear()} CodeGuard AI Inc. All rights reserved.</span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="hover:text-foreground transition-colors">Dashboard</Link>
          <Link href="/code-analysis" className="hover:text-foreground transition-colors">Code Analysis</Link>
          <Link href="/documentation-generator" className="hover:text-foreground transition-colors">Documentation</Link>
          <Link href="/interview-generator" className="hover:text-foreground transition-colors">Interview Prep</Link>
        </div>
      </div>
    </footer>
  );
}
