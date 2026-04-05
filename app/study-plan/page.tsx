"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  FileText,
  Filter,
  Plus,
  RefreshCcw,
  Sparkles,
  Upload,
} from "lucide-react";
import { SectionHeader } from "@/components/ui/section-header";
const MAX_WORKFLOW_TOPICS = 10;

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
  subjects: { id: string; name: string }[];
};

type WorkflowSubject = {
  name: string;
  importance: number;
  topics: {
    name: string;
    importance: number;
    suggestedDifficulty: number;
  }[];
};

type TopicInput = {
  subject: string;
  topic: string;
  priorKnowledge: "none" | "low" | "medium" | "high";
  suggestedDifficulty: number;
  importance: number;
};

function normalizePlan(data: unknown): PlanItem[] {
  const payload = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const candidateArray =
    (Array.isArray(payload.study_plan) && payload.study_plan) ||
    (Array.isArray(payload.daily_plan) && payload.daily_plan) ||
    (Array.isArray(payload.plan) && payload.plan) ||
    (Array.isArray(payload.topics) && payload.topics) ||
    (Array.isArray(payload.ranked_topics) && payload.ranked_topics) ||
    (Array.isArray(payload.predictions) && payload.predictions) ||
    (Array.isArray(payload) && payload) ||
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

function defaultExamDateInput() {
  const date = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function readOptionalFileText(file: File | null): Promise<string> {
  if (!file) return "";
  const formData = new FormData();
  formData.append("file", file);

  const endpoints = [
    "/api/study-plan?mode=upload",
    "/api/study-plan/workflow?mode=upload",
    "/api/upload",
  ];
  let lastError = "Upload API unavailable";

  for (const endpoint of endpoints) {
    const res = await fetch(endpoint, {
      method: "POST",
      body: formData,
    });
    const raw = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      if (res.status === 404) {
        lastError = `${endpoint} returned 404`;
        continue;
      }
      if (!res.ok) {
        throw new Error(
          `Upload API failed with non-JSON response (${res.status}). Please retry.`
        );
      }
      throw new Error("Upload API returned invalid response.");
    }

    if (!res.ok) {
      if (res.status === 404) {
        lastError = `${endpoint} returned 404`;
        continue;
      }
      throw new Error(
        String(data.error ?? `Failed to extract text from ${file.name}`)
      );
    }

    return String(data.extractedText ?? "");
  }

  throw new Error(`No upload endpoint available. ${lastError}`);
}

const toneMap = {
  high: "bg-rose-100 text-rose-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-emerald-100 text-emerald-700",
};

const knowledgeOptions: TopicInput["priorKnowledge"][] = [
  "none",
  "low",
  "medium",
  "high",
];

export default function StudyPlanPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [seedInfo, setSeedInfo] = useState<SeedInfo | null>(null);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [dayFilter, setDayFilter] = useState("all");

  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [extracting, setExtracting] = useState(false);
  const [calibrationSaving, setCalibrationSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [workflowSessionId, setWorkflowSessionId] = useState("");
  const [examName, setExamName] = useState("General Exam");
  const [examDate, setExamDate] = useState(defaultExamDateInput());
  const [targetScorePercent, setTargetScorePercent] = useState(75);
  const [syllabusFile, setSyllabusFile] = useState<File | null>(null);
  const [questionFile, setQuestionFile] = useState<File | null>(null);
  const [syllabusText, setSyllabusText] = useState("");
  const [questionPaperText, setQuestionPaperText] = useState("");
  const [extractedSubjects, setExtractedSubjects] = useState<WorkflowSubject[]>([]);
  const [topicInputs, setTopicInputs] = useState<TopicInput[]>([]);

  const planItems = useMemo(() => normalizePlan(result), [result]);
  const subjects = useMemo(
    () => ["all", ...new Set(planItems.map((item) => item.subject))],
    [planItems]
  );
  const days = useMemo(() => ["all", ...new Set(planItems.map((item) => item.day))], [planItems]);

  const filteredItems = planItems.filter(
    (item) =>
      (subjectFilter === "all" || item.subject === subjectFilter) &&
      (dayFilter === "all" || item.day === dayFilter)
  );

  async function ensureSeedInfo() {
    if (seedInfo) return seedInfo;

    const res = await fetch("/api/seed-info");
    if (res.status === 401) {
      window.location.href = "/login";
      throw new Error("Authentication required");
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to load student context");

    const info: SeedInfo = {
      studentId: String(data.studentId),
      subjects: Array.isArray(data.subjects) ? data.subjects : [],
    };

    setSeedInfo(info);
    return info;
  }

  async function loadLatestPlan() {
    setLoading(true);
    setError(null);
    try {
      const info = await ensureSeedInfo();
      const params = new URLSearchParams({ studentId: info.studentId });
      const res = await fetch(`/api/study-plan?${params.toString()}`, {
        cache: "no-store",
      });

      if (res.status === 404) {
        setResult(null);
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load study plan");
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

  async function handleExtractStep() {
    setExtracting(true);
    setError(null);
    try {
      const info = await ensureSeedInfo();
      const uploadedSyllabusText = await readOptionalFileText(syllabusFile);
      const uploadedQuestionText = await readOptionalFileText(questionFile);
      const finalSyllabusText = (syllabusText || uploadedSyllabusText).trim();
      const finalQuestionText = (questionPaperText || uploadedQuestionText).trim();

      if (!finalSyllabusText || !finalQuestionText) {
        throw new Error(
          "Upload or paste both syllabus and previous year question paper text."
        );
      }

      const res = await fetch("/api/study-plan/workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: info.studentId,
          examName,
          examDate,
          targetScorePercent,
          syllabusText: finalSyllabusText,
          questionPaperText: finalQuestionText,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to extract subjects/topics");

      setWorkflowSessionId(String(data.sessionId ?? ""));
      setExamName(String(data.examName ?? examName));
      setTargetScorePercent(
        Number.isFinite(Number(data.targetScorePercent))
          ? Number(data.targetScorePercent)
          : targetScorePercent
      );
      setExtractedSubjects(Array.isArray(data.subjects) ? data.subjects : []);
      setTopicInputs(
        Array.isArray(data.topicInputs)
          ? data.topicInputs.slice(0, MAX_WORKFLOW_TOPICS)
          : []
      );
      setWizardStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to extract subjects/topics");
    } finally {
      setExtracting(false);
    }
  }

  function handleStartNewExamWorkflow() {
    setWizardStep(1);
    setWorkflowSessionId("");
    setExamName("General Exam");
    setExamDate(defaultExamDateInput());
    setTargetScorePercent(75);
    setSyllabusFile(null);
    setQuestionFile(null);
    setSyllabusText("");
    setQuestionPaperText("");
    setExtractedSubjects([]);
    setTopicInputs([]);
    setError(null);
  }

  function updateTopicKnowledge(index: number, priorKnowledge: TopicInput["priorKnowledge"]) {
    setTopicInputs((prev) =>
      prev.map((topic, topicIndex) =>
        topicIndex === index ? { ...topic, priorKnowledge } : topic
      )
    );
  }

  async function handleSaveCalibration() {
    if (!workflowSessionId) {
      setError("Workflow session not found. Please run extraction again.");
      return;
    }

    setCalibrationSaving(true);
    setError(null);
    try {
      const info = await ensureSeedInfo();
      const res = await fetch("/api/study-plan/workflow", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: info.studentId,
          sessionId: workflowSessionId,
          topicInputs,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save topic calibration");
      setWizardStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save topic calibration");
    } finally {
      setCalibrationSaving(false);
    }
  }

  async function handleFinalizePlan() {
    if (!workflowSessionId) {
      setError("Workflow session not found. Please run extraction again.");
      return;
    }

    setFinalizing(true);
    setError(null);
    try {
      const info = await ensureSeedInfo();
      const res = await fetch("/api/study-plan/workflow", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: info.studentId,
          sessionId: workflowSessionId,
          topicInputs,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to finalize study plan");

      setResult(data);
      setSubjectFilter("all");
      setDayFilter("all");
      await loadLatestPlan();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to finalize study plan");
    } finally {
      setFinalizing(false);
    }
  }

  async function handleGenerateFromCurrentDb() {
    setLoading(true);
    setError(null);
    try {
      const info = await ensureSeedInfo();
      const res = await fetch("/api/study-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: info.studentId,
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
          String(row.id ?? "") === item.id ? { ...row, completed: nextCompleted } : row
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
      if (!res.ok) throw new Error(data.error ?? "Failed to update task status");

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
            String(row.id ?? "") === item.id ? { ...row, completed: !nextCompleted } : row
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
          subtitle="3-step workflow: upload exam docs, calibrate topic prior knowledge, set target score strategy, then generate a DB-backed prioritized plan."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleStartNewExamWorkflow}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                <Plus className="h-4 w-4" />
                New exam workflow
              </button>
              <button
                onClick={handleGenerateFromCurrentDb}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                {loading ? "Generating..." : "Regenerate from DB"}
              </button>
            </div>
          }
        />

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((step) => (
            <div
              key={step}
              className={`rounded-xl border px-4 py-3 text-sm ${
                wizardStep === step
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-slate-50 text-slate-700"
              }`}
            >
              Step {step}:{" "}
              {step === 1
                ? "Upload + Extract"
                : step === 2
                ? "Topic Calibration"
                : "Review + Submit"}
            </div>
          ))}
        </div>

        {wizardStep === 1 && (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                Exam Name
                <input
                  type="text"
                  value={examName}
                  onChange={(event) => setExamName(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  placeholder="e.g. JEE Main, Semester Final, UPSC Prelims"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Exam Date
                <input
                  type="date"
                  value={examDate}
                  onChange={(event) => setExamDate(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Target Score Planning
                <select
                  value={targetScorePercent}
                  onChange={(event) => setTargetScorePercent(Number(event.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value={45}>30-50% (Pass-focused, strength-first)</option>
                  <option value={65}>50-70% (Balanced coverage)</option>
                  <option value={80}>70-85% (Strong score)</option>
                  <option value={92}>85-100% (Top score, all topics important)</option>
                </select>
              </label>

              <label className="text-sm font-medium text-slate-700">
                Syllabus Upload
                <input
                  type="file"
                  accept=".txt,.md,.csv,.pdf,.doc,.docx"
                  onChange={(event) => setSyllabusFile(event.target.files?.[0] ?? null)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Previous Year Question Paper Upload
                <input
                  type="file"
                  accept=".txt,.md,.csv,.pdf,.doc,.docx"
                  onChange={(event) => setQuestionFile(event.target.files?.[0] ?? null)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Syllabus Text (optional if file text is readable)
                <textarea
                  value={syllabusText}
                  onChange={(event) => setSyllabusText(event.target.value)}
                  rows={5}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  placeholder="Paste syllabus text here if needed."
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Question Paper Text (optional if file text is readable)
                <textarea
                  value={questionPaperText}
                  onChange={(event) => setQuestionPaperText(event.target.value)}
                  rows={5}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  placeholder="Paste previous-year question paper text here if needed."
                />
              </label>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={handleExtractStep}
                disabled={extracting}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                <Upload className="h-4 w-4" />
                {extracting ? "Extracting..." : "Extract Important Subjects & Topics"}
              </button>
            </div>
          </section>
        )}

        {wizardStep === 2 && (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">
                Set prior knowledge per topic (max {MAX_WORKFLOW_TOPICS} topics)
              </p>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                {topicInputs.length} topics
              </span>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Subject</th>
                    <th className="px-4 py-3">Topic</th>
                    <th className="px-4 py-3">Suggested Difficulty</th>
                    <th className="px-4 py-3">Prior Knowledge</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {topicInputs.map((topic, index) => (
                    <tr key={`${topic.subject}-${topic.topic}`} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-700">{topic.subject}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{topic.topic}</td>
                      <td className="px-4 py-3 text-slate-700">{topic.suggestedDifficulty}/5</td>
                      <td className="px-4 py-3">
                        <select
                          value={topic.priorKnowledge}
                          onChange={(event) =>
                            updateTopicKnowledge(
                              index,
                              event.target.value as TopicInput["priorKnowledge"]
                            )
                          }
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
                        >
                          {knowledgeOptions.map((option) => (
                            <option key={option} value={option}>
                              {option.toUpperCase()}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex justify-between">
              <button
                onClick={() => setWizardStep(1)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Back
              </button>
              <button
                onClick={handleSaveCalibration}
                disabled={calibrationSaving || topicInputs.length === 0}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {calibrationSaving ? "Saving..." : "Save & Continue"}
              </button>
            </div>
          </section>
        )}

        {wizardStep === 3 && (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="grid gap-4 lg:grid-cols-5">
              <article className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Exam</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{examName}</p>
              </article>
              <article className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Exam date</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{examDate}</p>
              </article>
              <article className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Target score</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{targetScorePercent}%</p>
              </article>
              <article className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Important subjects</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{extractedSubjects.length}</p>
              </article>
              <article className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Selected topics</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{topicInputs.length}</p>
              </article>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Subject</th>
                    <th className="px-4 py-3">Topic</th>
                    <th className="px-4 py-3">Prior Knowledge</th>
                    <th className="px-4 py-3">Difficulty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {topicInputs.map((topic) => (
                    <tr key={`${topic.subject}-${topic.topic}`} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-700">{topic.subject}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{topic.topic}</td>
                      <td className="px-4 py-3 text-slate-700">{topic.priorKnowledge.toUpperCase()}</td>
                      <td className="px-4 py-3 text-slate-700">{topic.suggestedDifficulty}/5</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex justify-between">
              <button
                onClick={() => setWizardStep(2)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Back
              </button>
              <button
                onClick={handleFinalizePlan}
                disabled={finalizing || topicInputs.length === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                <FileText className="h-4 w-4" />
                {finalizing ? "Finalizing..." : "Finalize & Generate Plan"}
              </button>
            </div>
          </section>
        )}

        {error && (
          <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-medium text-slate-700">
            Subject
            <select
              value={subjectFilter}
              onChange={(event) => setSubjectFilter(event.target.value)}
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
              onChange={(event) => setDayFilter(event.target.value)}
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

        {!loading && !error && filteredItems.length === 0 && (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
            <Sparkles className="mx-auto h-6 w-6 text-slate-400" />
            <p className="mt-3 text-sm text-slate-600">
              No final plan yet. Complete Step 1-3 to generate your personalized study plan.
            </p>
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
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${toneMap[item.priority]}`}
                      >
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
