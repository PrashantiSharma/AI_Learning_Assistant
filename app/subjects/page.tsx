"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { BookOpen, Loader2, Plus, Tags, X } from "lucide-react";
import { SectionHeader } from "@/components/ui/section-header";

type Exam = {
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

type QuizQuestion = {
  id: string;
  question: string;
  options: [string, string, string, string];
};

type QuizReview = {
  id: string;
  question: string;
  selectedOptionIndex: number;
  correctOptionIndex: number;
  options: [string, string, string, string];
  isCorrect: boolean;
  explanation: string;
};

type QuizResult = {
  score: number;
  total: number;
  accuracy: number;
  review: QuizReview[];
};

export default function ExamPrepManagementPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [examName, setExamName] = useState("");
  const [examPyqContext, setExamPyqContext] = useState("");
  const [topicName, setTopicName] = useState("");
  const [selectedExamId, setSelectedExamId] = useState("");

  const [quizOpen, setQuizOpen] = useState(false);
  const [quizTopic, setQuizTopic] = useState<Topic | null>(null);
  const [quizAttemptId, setQuizAttemptId] = useState("");
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<number[]>([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizSubmitting, setQuizSubmitting] = useState(false);
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  const [quizError, setQuizError] = useState<string | null>(null);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const [examsRes, topicsRes] = await Promise.all([
        fetch("/api/subjects", { cache: "no-store" }),
        fetch("/api/topics", { cache: "no-store" }),
      ]);
      if (examsRes.status === 401 || topicsRes.status === 401) {
        window.location.href = "/login";
        return;
      }

      const examsData = await examsRes.json();
      const topicsData = await topicsRes.json();
      if (!examsRes.ok || !topicsRes.ok) {
        throw new Error(examsData.error ?? topicsData.error ?? "Failed loading exams/topics");
      }

      const uniqueExams = (Array.isArray(examsData) ? examsData : []).filter(
        (exam: Exam, index: number, arr: Exam[]) =>
          arr.findIndex(
            (entry) => entry.name.trim().toLowerCase() === exam.name.trim().toLowerCase()
          ) === index
      );

      setExams(uniqueExams);
      setTopics(Array.isArray(topicsData) ? topicsData : []);
      if (!selectedExamId && uniqueExams[0]?.id) {
        setSelectedExamId(uniqueExams[0].id);
      } else if (
        selectedExamId &&
        !uniqueExams.some((exam: Exam) => exam.id === selectedExamId)
      ) {
        setSelectedExamId(uniqueExams[0]?.id ?? "");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed loading exam data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchData();
  }, []);

  const selectedTopicList = useMemo(
    () => topics.filter((topic) => !selectedExamId || topic.subjectId === selectedExamId),
    [topics, selectedExamId]
  );

  const selectedExamName = useMemo(
    () => exams.find((exam) => exam.id === selectedExamId)?.name ?? "Selected Exam",
    [exams, selectedExamId]
  );

  async function createExam(e: FormEvent) {
    e.preventDefault();
    if (!examName.trim()) return;

    try {
      const res = await fetch("/api/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: examName.trim(),
          examPattern: examPyqContext.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create exam");

      setExamName("");
      setExamPyqContext("");
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create exam.");
    }
  }

  async function createTopic(e: FormEvent) {
    e.preventDefault();
    if (!topicName.trim() || !selectedExamId) return;

    try {
      const res = await fetch("/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: topicName.trim(), subjectId: selectedExamId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create topic");

      setTopicName("");
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create topic.");
    }
  }

  function closeQuizModal() {
    if (quizSubmitting) return;
    setQuizOpen(false);
    setQuizTopic(null);
    setQuizAttemptId("");
    setQuizQuestions([]);
    setQuizAnswers([]);
    setQuizResult(null);
    setQuizError(null);
  }

  async function openQuizModal(topic: Topic) {
    setQuizOpen(true);
    setQuizTopic(topic);
    setQuizAttemptId("");
    setQuizQuestions([]);
    setQuizAnswers([]);
    setQuizResult(null);
    setQuizError(null);
    setQuizLoading(true);

    try {
      const response = await fetch("/api/topics/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId: topic.id }),
      });
      const data = await response.json();
      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!response.ok) {
        throw new Error(String(data.error ?? "Failed to generate quiz"));
      }

      const questions = Array.isArray(data.questions) ? (data.questions as QuizQuestion[]) : [];
      if (questions.length !== 10) {
        throw new Error("Quiz must contain exactly 10 questions.");
      }

      setQuizAttemptId(String(data.attemptId ?? ""));
      setQuizQuestions(questions);
      setQuizAnswers(new Array(questions.length).fill(-1));
    } catch (err) {
      setQuizError(err instanceof Error ? err.message : "Failed to generate quiz.");
    } finally {
      setQuizLoading(false);
    }
  }

  function chooseAnswer(questionIndex: number, optionIndex: number) {
    setQuizAnswers((prev) =>
      prev.map((value, index) => (index === questionIndex ? optionIndex : value))
    );
  }

  async function submitQuiz() {
    if (!quizAttemptId || quizAnswers.some((value) => value < 0)) return;

    setQuizSubmitting(true);
    setQuizError(null);
    try {
      const response = await fetch("/api/topics/quiz/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptId: quizAttemptId,
          answers: quizAnswers,
        }),
      });
      const data = await response.json();
      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!response.ok) {
        throw new Error(String(data.error ?? "Failed to submit quiz"));
      }

      setQuizResult({
        score: Number(data.score ?? 0),
        total: Number(data.total ?? 10),
        accuracy: Number(data.accuracy ?? 0),
        review: Array.isArray(data.review) ? (data.review as QuizReview[]) : [],
      });
      await fetchData();
    } catch (err) {
      setQuizError(err instanceof Error ? err.message : "Failed to submit quiz.");
    } finally {
      setQuizSubmitting(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
      <SectionHeader
        title="Exam Prep Management"
        subtitle="Create exams, attach topics, and run topic quizzes to evaluate exam readiness."
      />

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <form onSubmit={createExam} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
            <BookOpen className="h-4 w-4" />
            Add Exam
          </h2>
          <div className="mt-4 space-y-3">
            <input
              value={examName}
              onChange={(e) => setExamName(e.target.value)}
              placeholder="e.g. GATE Aerospace 2026"
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm"
            />
            <textarea
              value={examPyqContext}
              onChange={(e) => setExamPyqContext(e.target.value)}
              placeholder="Optional: paste PYQ pattern/context for this exam."
              rows={3}
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm"
            />
            <button className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">
              <Plus className="h-4 w-4" />
              Add Exam
            </button>
          </div>
        </form>

        <form onSubmit={createTopic} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Tags className="h-4 w-4" />
            Add Topic To Exam
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <input
              value={topicName}
              onChange={(e) => setTopicName(e.target.value)}
              placeholder="e.g. Fluid Mechanics"
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm"
            />
            <select
              value={selectedExamId}
              onChange={(e) => setSelectedExamId(e.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm"
            >
              {exams.map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {exam.name}
                </option>
              ))}
            </select>
            <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">
              Save
            </button>
          </div>
        </form>
      </section>

      {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}

      {loading ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {[1, 2].map((item) => (
            <div key={item} className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
          ))}
        </div>
      ) : selectedTopicList.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-600">
          No topics available for this exam yet. Add topics and start quiz-based evaluation.
        </div>
      ) : (
        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
            Exam: {selectedExamName}
          </div>
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Topic</th>
                <th className="px-4 py-3">Difficulty</th>
                <th className="px-4 py-3">Quiz Accuracy</th>
                <th className="px-4 py-3">Revision Count</th>
                <th className="px-4 py-3">Take Quiz</th>
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
                      <button
                        onClick={() => void openQuizModal(topic)}
                        className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                      >
                        Take Quiz
                      </button>
                    </td>
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

      {quizOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Topic Quiz: {quizTopic?.name ?? "Topic"}
                </h3>
                <p className="text-sm text-slate-600">
                  10 questions, 4 options each. Submit to evaluate your exam readiness.
                </p>
              </div>
              <button
                onClick={closeQuizModal}
                className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-4">
              {quizLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-700">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating quiz from Hugging Face...
                </div>
              ) : quizError ? (
                <p className="text-sm text-rose-600">{quizError}</p>
              ) : quizResult ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                    Score: <strong>{quizResult.score}</strong> / {quizResult.total} (
                    {quizResult.accuracy.toFixed(2)}%)
                  </div>
                  <div className="space-y-3">
                    {quizResult.review.map((item, index) => (
                      <article key={item.id} className="rounded-xl border border-slate-200 p-4">
                        <p className="text-sm font-semibold text-slate-800">
                          Q{index + 1}. {item.question}
                        </p>
                        <p
                          className={`mt-2 text-sm ${
                            item.isCorrect ? "text-emerald-700" : "text-rose-700"
                          }`}
                        >
                          Your answer: {item.options[item.selectedOptionIndex]} | Correct answer:{" "}
                          {item.options[item.correctOptionIndex]}
                        </p>
                        <p className="mt-1 text-xs text-slate-600">{item.explanation}</p>
                      </article>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  {quizQuestions.map((question, questionIndex) => (
                    <article key={question.id} className="rounded-xl border border-slate-200 p-4">
                      <p className="text-sm font-semibold text-slate-800">
                        Q{questionIndex + 1}. {question.question}
                      </p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {question.options.map((option, optionIndex) => (
                          <label
                            key={`${question.id}-option-${optionIndex}`}
                            className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
                          >
                            <input
                              type="radio"
                              name={`question-${question.id}`}
                              checked={quizAnswers[questionIndex] === optionIndex}
                              onChange={() => chooseAnswer(questionIndex, optionIndex)}
                            />
                            <span>{option}</span>
                          </label>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            {!quizLoading && !quizError && !quizResult ? (
              <div className="flex justify-end border-t border-slate-200 px-5 py-4">
                <button
                  disabled={quizSubmitting || quizAnswers.some((value) => value < 0)}
                  onClick={() => void submitQuiz()}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {quizSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Evaluating...
                    </>
                  ) : (
                    "Submit Quiz"
                  )}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
