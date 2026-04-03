"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { BookOpen, Plus, Tags } from "lucide-react";
import { SectionHeader } from "@/components/ui/section-header";

type Subject = {
  id: string;
  name: string;
  studentId: string;
  topics: Topic[];
};

type Topic = {
  id: string;
  name: string;
  subjectId: string;
  difficulty: number | null;
  quizAccuracy: number | null;
  revisionCount: number | null;
  completionRatio: number | null;
};

export default function SubjectManagementPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [subjectName, setSubjectName] = useState("");
  const [topicName, setTopicName] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const [subjectsRes, topicsRes] = await Promise.all([fetch("/api/subjects"), fetch("/api/topics")]);
      const subjectsData = await subjectsRes.json();
      const topicsData = await topicsRes.json();

      if (!subjectsRes.ok || !topicsRes.ok) {
        throw new Error(subjectsData.error ?? topicsData.error ?? "Failed loading subjects/topics");
      }

      setSubjects(subjectsData);
      setTopics(topicsData);
      if (!selectedSubjectId && subjectsData[0]?.id) {
        setSelectedSubjectId(subjectsData[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed loading subject data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  const selectedTopicList = useMemo(
    () => topics.filter((topic) => !selectedSubjectId || topic.subjectId === selectedSubjectId),
    [topics, selectedSubjectId],
  );

  async function createSubject(e: FormEvent) {
    e.preventDefault();
    if (!subjectName.trim()) return;

    try {
      const seedRes = await fetch("/api/seed-info");
      const seedInfo = await seedRes.json();
      if (!seedRes.ok) throw new Error(seedInfo.error ?? "Student not found");

      const res = await fetch("/api/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: subjectName, studentId: seedInfo.studentId }),
      });
      if (!res.ok) throw new Error("Failed to create subject");

      setSubjectName("");
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create subject.");
    }
  }

  async function createTopic(e: FormEvent) {
    e.preventDefault();
    if (!topicName.trim() || !selectedSubjectId) return;

    try {
      const res = await fetch("/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: topicName, subjectId: selectedSubjectId }),
      });
      if (!res.ok) throw new Error("Failed to create topic");

      setTopicName("");
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create topic.");
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
      <SectionHeader
        title="Subject & Topic Management"
        subtitle="Manage academic domains and monitor topic-level readiness from one structured workspace."
      />

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <form onSubmit={createSubject} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
            <BookOpen className="h-4 w-4" />
            Add Subject
          </h2>
          <div className="mt-4 flex gap-3">
            <input
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
              placeholder="e.g. Data Structures"
              className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm"
            />
            <button className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
        </form>

        <form onSubmit={createTopic} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Tags className="h-4 w-4" />
            Add Topic
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <input
              value={topicName}
              onChange={(e) => setTopicName(e.target.value)}
              placeholder="e.g. Dynamic Programming"
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm"
            />
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm"
            >
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
            <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">Save</button>
          </div>
        </form>
      </section>

      {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}

      {loading ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {[1, 2].map((item) => (
            <div key={item} className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
          ))}
        </div>
      ) : selectedTopicList.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-600">
          No topics available yet. Add a topic to start tracking difficulty, quiz accuracy, revisions, and status.
        </div>
      ) : (
        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Topic</th>
                <th className="px-4 py-3">Difficulty</th>
                <th className="px-4 py-3">Quiz Accuracy</th>
                <th className="px-4 py-3">Revision Count</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {selectedTopicList.map((topic) => {
                const completion = Math.round(Number(topic.completionRatio ?? 0) * 100);
                return (
                  <tr key={topic.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{topic.name}</td>
                    <td className="px-4 py-3 text-slate-700">{topic.difficulty ?? "-"}/5</td>
                    <td className="px-4 py-3 text-slate-700">{topic.quizAccuracy ?? 0}%</td>
                    <td className="px-4 py-3 text-slate-700">{topic.revisionCount ?? 0}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        {completion >= 80 ? "Strong" : completion >= 45 ? "On track" : "Needs work"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
