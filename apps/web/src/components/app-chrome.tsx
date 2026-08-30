"use client";

import type React from "react";
import { usePathname } from "next/navigation";
import { UnifiedNavbar } from "@/components/unified-navbar";

export default function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isStandalonePage = pathname === "/" || pathname === "/login" || pathname === "/register";

  return (
    <div className="min-h-screen w-full bg-[#03060c] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-black">
      {!isStandalonePage && <UnifiedNavbar />}
      <main className="flex-1 w-full flex flex-col">{children}</main>
    </div>
  );
}
