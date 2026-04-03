"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BotMessageSquare,
  BookOpen,
  GraduationCap,
  LayoutDashboard,
  NotebookText,
} from "lucide-react";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/study-plan", label: "Study Plan", icon: NotebookText },
  { href: "/assistant", label: "LLM API", icon: BotMessageSquare },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/subjects", label: "Subjects", icon: BookOpen },
];

export function AppNavigation() {
  const pathname = usePathname();

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
        </nav>
      </div>
    </header>
  );
}
