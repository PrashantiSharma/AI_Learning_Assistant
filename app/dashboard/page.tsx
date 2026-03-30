import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DashboardCard } from "@/components/dashboard-card";

export default async function DashboardPage() {
  const student = await prisma.student.findFirst({
    include: {
      subjects: { include: { topics: true } },
      studyPlans: true,
      studyLogs: true,
    },
  });

  const subjectCount = student?.subjects.length ?? 0;
  const topicCount = student?.subjects.reduce((acc, s) => acc + s.topics.length, 0) ?? 0;
  const planCount = student?.studyPlans.length ?? 0;
  const logCount = student?.studyLogs.length ?? 0;

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-bold text-slate-900">Student Dashboard</h1>
        <p className="mt-2 text-slate-600">
          Track progress, generate study plans, and chat with the assistant.
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-4">
          <DashboardCard title="Subjects" value={subjectCount.toString()} description="Tracked subjects" />
          <DashboardCard title="Topics" value={topicCount.toString()} description="Topics in the system" />
          <DashboardCard title="Plans" value={planCount.toString()} description="Generated study plans" />
          <DashboardCard title="Logs" value={logCount.toString()} description="Study sessions recorded" />
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <Link href="/study-plan" className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xl font-semibold">Study Plan</h2>
            <p className="mt-2 text-sm text-slate-600">
              Generate adaptive daily plans based on student performance.
            </p>
          </Link>

          <Link href="/assistant" className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xl font-semibold">AI Assistant</h2>
            <p className="mt-2 text-sm text-slate-600">
              Ask about weak topics, revision strategy, and exam preparation.
            </p>
          </Link>

          <Link href="/study-plan" className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xl font-semibold">Plan Output</h2>
            <p className="mt-2 text-sm text-slate-600">
              Review saved plan JSON and ranked topic recommendations.
            </p>
          </Link>
        </div>
      </div>
    </main>
  );
}
