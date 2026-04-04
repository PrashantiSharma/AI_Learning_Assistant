"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Filter, RefreshCcw, Sparkles } from "lucide-react";
import { SectionHeader } from "@/components/ui/section-header";

type PlanItem = {
  id: string;
  title: string;
  subject: string;
  priority: "high" | "medium" | "low";
  difficulty: number;
  completed: boolean;
  day: string;
};

type SeedInfo = {
  studentId: string;
  subjectId: string;
};

function normalizePlan(data: any): PlanItem[] {
  if (!data) return [];

  const candidateArray =
    (Array.isArray(data?.study_plan) && data.study_plan) ||
    (Array.isArray(data?.daily_plan) && data.daily_plan) ||
    (Array.isArray(data?.plan) && data.plan) ||
    (Array.isArray(data?.topics) && data.topics) ||
    (Array.isArray(data?.ranked_topics) && data.ranked_topics) ||
    (Array.isArray(data?.predictions) && data.predictions) ||
    (Array.isArray(data) && data) ||
    [];

  return candidateArray.map((item: any, index: number) => ({
    id: String(item.id ?? index),
    title: item.topic_name ?? item.topic ?? item.name ?? `Topic ${index + 1}`,
    subject: item.subject ?? item.subject_name ?? "General",
    priority:
      String(
        item.priority ??
          item.predicted_priority_class ??
          item.predicted_priority ??
          "medium"
      ).toLowerCase() === "high"
        ? "high"
        : String(
              item.priority ??
                item.predicted_priority_class ??
                item.predicted_priority ??
                "medium"
            ).toLowerCase() === "low"
          ? "low"
          : "medium",
    difficulty: Number(item.topic_difficulty ?? item.difficulty ?? 3),
    completed: Boolean(item.completed ?? false),
    day: item.day ?? item.date ?? `Day ${index + 1}`,
  }));
}

const toneMap = {
  high: "bg-rose-100 text-rose-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-emerald-100 text-emerald-700",
};

export default function StudyPlanPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [seedInfo, setSeedInfo] = useState<SeedInfo | null>(null);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [dayFilter, setDayFilter] = useState("all");

  const planItems = useMemo(() => normalizePlan(result), [result]);

  const subjects = useMemo(
    () => ["all", ...new Set(planItems.map((item) => item.subject))],
    [planItems],
  );
  const days = useMemo(() => ["all", ...new Set(planItems.map((item) => item.day))], [planItems]);

  const filteredItems = planItems.filter(
    (item) =>
      (subjectFilter === "all" || item.subject === subjectFilter) &&
      (dayFilter === "all" || item.day === dayFilter),
  );

  async function ensureSeedInfo() {
    if (seedInfo) return seedInfo;

    const studentRes = await fetch("/api/seed-info");
    const data = await studentRes.json();

    if (!studentRes.ok) {
      throw new Error(data.error ?? "Failed to load student context");
    }

    const info = {
      studentId: String(data.studentId),
      subjectId: String(data.subjectId),
    };

    setSeedInfo(info);
    return info;
  }

  async function loadLatestPlan() {
    setLoading(true);
    setError(null);

    try {
      const info = await ensureSeedInfo();
      const params = new URLSearchParams({
        studentId: info.studentId,
        subjectId: info.subjectId,
        autoGenerate: "true",
      });

      const res = await fetch(`/api/study-plan?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load study plan");
      }

      setResult(data);
      setSubjectFilter("all");
      setDayFilter("all");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load study plan");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLatestPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleGenerate() {
    setLoading(true);
    setError(null);

    try {
      const info = await ensureSeedInfo();

      const res = await fetch("/api/study-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: info.studentId,
          subjectId: info.subjectId,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate plan");
      setResult(data);
      setSubjectFilter("all");
      setDayFilter("all");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate study plan");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleComplete(item: PlanItem) {
    const nextCompleted = !item.completed;

    setUpdatingItemId(item.id);
    setError(null);

    setResult((prev: any) => {
      if (!prev || !Array.isArray(prev.study_plan)) return prev;
      return {
        ...prev,
        study_plan: prev.study_plan.map((row: any) =>
          String(row.id ?? "") === item.id ? { ...row, completed: nextCompleted } : row,
        ),
      };
    });

    try {
      const info = await ensureSeedInfo();
      const res = await fetch("/api/study-plan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: info.studentId,
          itemId: item.id,
          completed: nextCompleted,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to update task status");
      }

      if (Array.isArray(data.study_plan)) {
        setResult((prev: any) => ({
          ...(prev && typeof prev === "object" ? prev : {}),
          study_plan: data.study_plan,
        }));
      }
    } catch (err) {
      setResult((prev: any) => {
        if (!prev || !Array.isArray(prev.study_plan)) return prev;
        return {
          ...prev,
          study_plan: prev.study_plan.map((row: any) =>
            String(row.id ?? "") === item.id ? { ...row, completed: !nextCompleted } : row,
          ),
        };
      });
      setError(err instanceof Error ? err.message : "Failed to update task status");
    } finally {
      setUpdatingItemId(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <SectionHeader
          title="Study Plan Generator"
          subtitle="Design and review your adaptive daily schedule with clear priorities and execution status."
          action={
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Generating..." : "Regenerate plan"}
            </button>
          }
        />

        <div className="mt-5 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-medium text-slate-700">
            Subject
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {subjects.map((subject) => (
                <option key={subject} value={subject}>
                  {subject === "all" ? "All subjects" : subject}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Day
            <select
              value={dayFilter}
              onChange={(e) => setDayFilter(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {days.map((day) => (
                <option key={day} value={day}>
                  {day === "all" ? "All days" : day}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-lg border border-slate-300 bg-white px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-slate-500">Visible tasks</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{filteredItems.length}</p>
          </div>
        </div>

        {error && (
          <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        )}

        {!loading && !error && filteredItems.length === 0 && (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
            <Sparkles className="mx-auto h-6 w-6 text-slate-400" />
            <p className="mt-3 text-sm text-slate-600">No plan data yet. Generate a plan to see your schedule view.</p>
          </div>
        )}

        {filteredItems.length > 0 && (
          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Topic</th>
                  <th className="px-4 py-3">Day</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Difficulty</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-4">
                      <p className="font-medium text-slate-900">{item.title}</p>
                      <p className="text-xs text-slate-500">{item.subject}</p>
                    </td>
                    <td className="px-4 py-4 text-slate-700">{item.day}</td>
                    <td className="px-4 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${toneMap[item.priority]}`}>
                        {item.priority}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-700">{item.difficulty}/5</td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${
                          item.completed
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {item.completed ? "Completed" : "In progress"}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <button
                        onClick={() => handleToggleComplete(item)}
                        disabled={updatingItemId === item.id}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                      >
                        <Filter className="h-3.5 w-3.5" />
                        {updatingItemId === item.id
                          ? "Updating..."
                          : item.completed
                            ? "Mark in progress"
                            : "Mark complete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
