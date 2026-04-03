import { LucideIcon } from "lucide-react";

type StatCardProps = {
  title: string;
  value: string;
  hint: string;
  tone?: "primary" | "success" | "warning" | "neutral";
  icon: LucideIcon;
};

const toneMap = {
  primary: "from-indigo-500/20 to-cyan-400/20 text-indigo-700",
  success: "from-emerald-500/20 to-green-400/20 text-emerald-700",
  warning: "from-amber-500/25 to-orange-400/20 text-amber-700",
  neutral: "from-slate-200 to-slate-100 text-slate-700",
};

export function StatCard({ title, value, hint, tone = "neutral", icon: Icon }: StatCardProps) {
  return (
    <article className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
        </div>
        <span className={`rounded-xl bg-gradient-to-br p-2 ${toneMap[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 text-xs text-slate-500">{hint}</p>
    </article>
  );
}
