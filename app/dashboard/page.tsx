import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarClock,
  CircleCheckBig,
  Clock3,
  Sparkles,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedStudentForPage } from "@/lib/auth";
import { StatCard } from "@/components/ui/stat-card";
import { SectionHeader } from "@/components/ui/section-header";

export default async function DashboardPage() {
  const authStudent = await requireAuthenticatedStudentForPage();
  const student = await prisma.student.findUnique({
    where: { id: authStudent.id },
    include: {
      subjects: { include: { topics: true } },
      studyPlans: true,
      studyLogs: true,
    },
  });

  const subjectCount = student?.subjects.length ?? 0;
  const topics = student?.subjects.flatMap((subject) => subject.topics) ?? [];
  const weakTopics = topics.filter((topic) => (topic.quizAccuracy ?? 100) < 55);
  const upcomingExam = student?.subjects
    .filter((subject) => subject.examDate)
    .sort((a, b) => +new Date(a.examDate ?? new Date()) - +new Date(b.examDate ?? new Date()))[0];

  const completionRatio =
    topics.length > 0
      ? Math.round(
          (topics.reduce((acc, topic) => acc + Number(topic.completionRatio ?? 0), 0) / topics.length) * 100,
        )
      : 0;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
      <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-slate-900 via-indigo-900 to-cyan-800 p-8 text-white shadow-xl sm:p-10">
        <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium uppercase tracking-wide">
          <Sparkles className="h-3.5 w-3.5" />
          Smart Academic Workspace
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Welcome back, {student?.name ?? "Student"}.</h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-100/90 sm:text-base">
          Manage your study strategy, track weak areas, and optimize your daily momentum with your personalized LLM API-powered learning workflow.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/study-plan" className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100">
            Generate today&apos;s plan
          </Link>
          <Link href="/assistant" className="rounded-xl border border-white/50 px-4 py-2 text-sm font-medium text-white hover:bg-white/10">
            Open LLM API assistant
          </Link>
        </div>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Subjects" value={String(subjectCount)} hint="Active learning domains" icon={BookOpen} tone="primary" />
        <StatCard title="Completion" value={`${completionRatio}%`} hint="Average syllabus completion" icon={CircleCheckBig} tone="success" />
        <StatCard title="Weak topics" value={String(weakTopics.length)} hint="Topics below 55% quiz accuracy" icon={AlertTriangle} tone="warning" />
        <StatCard title="Study sessions" value={String(student?.studyLogs.length ?? 0)} hint="Logged study activities" icon={Clock3} tone="neutral" />
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border bg-white p-6 shadow-sm lg:col-span-2">
          <SectionHeader
            title="Priority snapshot"
            subtitle="High-level insights for your next study block"
          />
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Weakest topic</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{weakTopics[0]?.name ?? "No weak topics identified"}</p>
              <p className="mt-2 text-sm text-slate-600">Focus on concept recap + quizzes before moving to advanced topics.</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Upcoming exam</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{upcomingExam?.name ?? "No exam date set"}</p>
              <p className="mt-2 text-sm text-slate-600">
                {upcomingExam?.examDate
                  ? new Date(upcomingExam.examDate).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "Add exam dates in Subject Management for better prioritization."}
              </p>
            </article>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Quick navigation</h2>
          <p className="mt-1 text-sm text-slate-600">Jump to key modules in one click.</p>
          <div className="mt-4 space-y-2">
            {[
              { href: "/study-plan", label: "Study Plan Builder" },
              { href: "/assistant", label: "LLM API Assistant" },
              { href: "/analytics", label: "Progress Analytics" },
              { href: "/subjects", label: "Subject & Topic Management" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
              >
                {item.label}
                <ArrowRight className="h-4 w-4" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-6 shadow-sm">
        <div className="flex items-center gap-3 text-indigo-900">
          <CalendarClock className="h-5 w-5" />
          <p className="text-sm font-semibold">Today&apos;s study target</p>
        </div>
        <p className="mt-2 text-sm text-indigo-900/90">
          Complete at least <strong>{Math.max(2, Math.ceil((student?.dailyStudyHours ?? 2) * 1.5))}</strong> focused sessions and revisit <strong>1 weak topic</strong> before ending the day.
        </p>
      </section>
    </main>
  );
}
