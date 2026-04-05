import { prisma } from "@/lib/prisma";
import { requireAuthenticatedStudentForPage } from "@/lib/auth";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { Activity, CalendarCheck2, ChartNoAxesColumn, RefreshCcw } from "lucide-react";

export default async function AnalyticsPage() {
  const authStudent = await requireAuthenticatedStudentForPage();
  const student = await prisma.student.findUnique({
    where: { id: authStudent.id },
    include: { subjects: { include: { topics: true } }, studyLogs: true },
  });

  const topics = student?.subjects.flatMap((subject) => subject.topics) ?? [];
  const avgAccuracy = topics.length
    ? Math.round(topics.reduce((sum, topic) => sum + Number(topic.quizAccuracy ?? 0), 0) / topics.length)
    : 0;

  const strongTopics = topics.filter((topic) => Number(topic.quizAccuracy ?? 0) >= 75).length;
  const weakTopics = topics.filter((topic) => Number(topic.quizAccuracy ?? 0) < 55).length;
  const revisionTotal = topics.reduce((sum, topic) => sum + Number(topic.revisionCount ?? 0), 0);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
      <SectionHeader
        title="Progress Analytics"
        subtitle="Track completion trends, revision consistency, and weak/strong topic movement over time."
      />

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Completion rate" value={`${avgAccuracy}%`} hint="Average quiz accuracy" tone="primary" icon={ChartNoAxesColumn} />
        <StatCard title="Revision frequency" value={`${revisionTotal}`} hint="Total recorded revisions" tone="success" icon={RefreshCcw} />
        <StatCard title="Strong topics" value={`${strongTopics}`} hint="Above 75% quiz accuracy" tone="success" icon={CalendarCheck2} />
        <StatCard title="Weak topics" value={`${weakTopics}`} hint="Needs immediate support" tone="warning" icon={Activity} />
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-3">
        {["Completion trend", "Revision heatmap", "Subject comparison"].map((title) => (
          <article key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            <div className="mt-4 h-48 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
              <div className="h-full w-full animate-pulse rounded-lg bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200" />
            </div>
            <p className="mt-3 text-xs text-slate-500">Chart container ready for live chart binding.</p>
          </article>
        ))}
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <article className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5">
          <h3 className="text-sm font-semibold text-emerald-900">Strong topic insight</h3>
          <p className="mt-2 text-sm text-emerald-900/90">
            You currently have <strong>{strongTopics}</strong> high-performing topics. Keep momentum by maintaining spaced revision and timed quizzes.
          </p>
        </article>
        <article className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5">
          <h3 className="text-sm font-semibold text-amber-900">Weak topic insight</h3>
          <p className="mt-2 text-sm text-amber-900/90">
            <strong>{weakTopics}</strong> topics need reinforcement. Prioritize concept recap, targeted problem sets, and one LLM API-guided session daily.
          </p>
        </article>
      </section>
    </main>
  );
}
