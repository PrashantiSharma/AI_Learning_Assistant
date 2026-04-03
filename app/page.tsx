import Link from "next/link";
import { ArrowRight, BookCheck, BotMessageSquare, Sparkles } from "lucide-react";

export default function HomePage() {
  return (
    <main className="mx-auto min-h-[calc(100vh-72px)] w-full max-w-7xl px-4 py-12 sm:px-6">
      <section className="rounded-3xl border border-slate-200/80 bg-white/95 p-8 shadow-xl shadow-slate-200/30 sm:p-12">
        <p className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-700">
          <Sparkles className="h-3.5 w-3.5" />
          AI-Based Intelligent Learning Assistant
        </p>
        <h1 className="mt-4 max-w-4xl text-3xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          Premium study planning and LLM API guidance for serious academic progress.
        </h1>
        <p className="mt-4 max-w-3xl text-sm text-slate-600 sm:text-base">
          Build adaptive plans, manage subjects and topic-level insights, track completion and revision trends, and ask the LLM Study Assistant for structured exam preparation support.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: BookCheck,
              title: "Adaptive Study Plans",
              desc: "Generate personalized daily plans with ML-backed topic ranking.",
            },
            {
              icon: BotMessageSquare,
              title: "LLM API Assistant",
              desc: "Get strategy support for weak topics and revision decisions.",
            },
            {
              icon: ArrowRight,
              title: "Progress Analytics",
              desc: "Review completion, frequency, strengths, and risk areas quickly.",
            },
          ].map((feature) => (
            <article key={feature.title} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <feature.icon className="h-5 w-5 text-indigo-600" />
              <h2 className="mt-3 text-sm font-semibold text-slate-900">{feature.title}</h2>
              <p className="mt-1 text-sm text-slate-600">{feature.desc}</p>
            </article>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/dashboard" className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white hover:bg-slate-800">
            Open Dashboard
          </Link>
          <Link href="/assistant" className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700 hover:bg-slate-100">
            Open LLM API Assistant
          </Link>
        </div>
      </section>
    </main>
  );
}
