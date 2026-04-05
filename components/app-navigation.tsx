"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  BotMessageSquare,
  BookOpen,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  NotebookText,
} from "lucide-react";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/study-plan", label: "Study Plan", icon: NotebookText },
  { href: "/assistant", label: "LLM API", icon: BotMessageSquare },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/subjects", label: "Exams", icon: BookOpen },
];

export function AppNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [studentName, setStudentName] = useState<string | null>(null);
  const isAuthPage = pathname === "/login" || pathname === "/register";

  useEffect(() => {
    if (isAuthPage) return;
    let cancelled = false;

    async function loadSession() {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        const data = await response.json();
        if (!cancelled && response.ok) {
          setStudentName(String(data.student?.name ?? ""));
        }
      } catch {
        if (!cancelled) setStudentName(null);
      }
    }

    void loadSession();
    return () => {
      cancelled = true;
    };
  }, [isAuthPage]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.push("/login");
    router.refresh();
  }

  if (isAuthPage) return null;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="inline-flex items-center gap-2 text-slate-900">
          <span className="rounded-xl bg-gradient-to-br from-indigo-600 to-cyan-500 p-2 text-white shadow-sm">
            <GraduationCap className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold sm:text-base">AI Learning Assistant</span>
        </Link>

        <nav className="flex flex-wrap items-center gap-2">
          {links.map((link) => {
            const Icon = link.icon;
            const active = pathname === link.href;

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${
                  active
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}
          {studentName ? (
            <>
              <span className="ml-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700">
                {studentName}
              </span>
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
