"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import Icon from "@/components/icon";

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const pathname = usePathname();

  const navLinks = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/code-analysis", label: "Code Analysis" },
    { href: "/repository-analysis", label: "Repository" },
    { href: "/documentation-generator", label: "Documentation" },
    { href: "/interview-generator", label: "Interview" },
  ];

  return (
    <nav className="border-b border-border/40 bg-background/80 backdrop-blur sticky top-0 z-50 px-4 py-3">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <div className="p-1 rounded-lg bg-primary/10 text-primary">
            <Icon icon="shield" size={22} />
          </div>
          CodeGuard AI
        </Link>

        {/* Center Nav */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-accent text-accent-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* Right Auth Section */}
        <div className="flex items-center gap-3">
          {isAuthenticated && user ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-accent/60 border border-border/30 text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span className="font-medium text-foreground max-w-[140px] truncate">
                  {user.displayName || user.email}
                </span>
              </div>
              <button
                onClick={() => logout()}
                className="px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="px-3 py-1.5 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Get Started
              </Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
