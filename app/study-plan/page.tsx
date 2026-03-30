"use client";

import { useState } from "react";

export default function StudyPlanPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function handleGenerate() {
    setLoading(true);
    try {
      const studentRes = await fetch("/api/seed-info");
      const seedInfo = await studentRes.json();

      const res = await fetch("/api/study-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: seedInfo.studentId,
          subjectId: seedInfo.subjectId,
        }),
      });

      const data = await res.json();
      setResult(data);
    } catch (error) {
      setResult({ error: "Failed to generate study plan" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-bold">Adaptive Study Plan</h1>
        <p className="mt-2 text-slate-600">
          Generate a ranked topic plan using the ML scoring service.
        </p>

        <button
          onClick={handleGenerate}
          className="mt-6 rounded-xl bg-slate-900 px-5 py-3 text-white"
        >
          {loading ? "Generating..." : "Generate Study Plan"}
        </button>

        <pre className="mt-8 overflow-auto rounded-2xl bg-white p-6 text-sm shadow-sm ring-1 ring-slate-200">
          {result ? JSON.stringify(result, null, 2) : "No study plan generated yet."}
        </pre>
      </div>
    </main>
  );
}
