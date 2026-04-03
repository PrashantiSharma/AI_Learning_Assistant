import { ReactNode } from "react";
import { AppNavigation } from "@/components/app-navigation";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="relative min-h-screen bg-slate-50">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.12),_transparent_38%),radial-gradient(circle_at_20%_80%,_rgba(99,102,241,0.08),_transparent_30%)]" />
      <AppNavigation />
      <div className="relative">{children}</div>
    </div>
  );
}
