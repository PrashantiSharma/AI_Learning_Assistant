import Link from "next/link";
import { Space_Grotesk, Playfair_Display } from "next/font/google";
import { getAuthenticatedStudentFromCookieStore } from "@/lib/auth";
import {
  ArrowRight,
  BotMessageSquare,
  BrainCircuit,
  ChartNoAxesCombined,
  CheckCircle2,
  Sparkles,
  Target,
} from "lucide-react";

const headingFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700"],
});

const serifFont = Playfair_Display({
  subsets: ["latin"],
  weight: ["600", "700"],
});

export default async function HomePage() {
  const student = await getAuthenticatedStudentFromCookieStore();

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-14 pt-8 sm:px-6 lg:pb-20 lg:pt-12">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10 lg:p-12">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-gradient-to-br from-cyan-200 to-indigo-200 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-gradient-to-tr from-amber-100 to-rose-100 blur-3xl" />

        <div className="relative grid gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
              <Sparkles className="h-3.5 w-3.5 text-cyan-700" />
              AI Learning Assistant
            </p>
            <h1
              className={`${headingFont.className} mt-4 max-w-3xl text-4xl font-bold leading-tight text-slate-900 sm:text-5xl`}
            >
              Study Like a{" "}
              <span className={`${serifFont.className} text-indigo-700`}>Strategist</span>,
              Not Just a Hard Worker.
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
              Build exam-ready plans from syllabus and PYQ inputs, calibrate prior
              knowledge topic by topic, and run a focused daily workflow powered by
              LLM + priority scoring. Everything stays stored per user in your own
              learning workspace.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              {student ? (
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
                >
                  Open My Dashboard
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : (
                <>
                  <Link
                    href="/register"
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
                  >
                    Create Free Account
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                  >
                    Login
                  </Link>
                </>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-900 p-5 text-slate-100 sm:p-6">
            <p className="text-xs uppercase tracking-[0.15em] text-cyan-200">
              Workflow Snapshot
            </p>
            <div className="mt-4 space-y-3 text-sm">
              {[
                "Upload syllabus + previous year papers",
                "Extract top 10 exam-critical topics",
                "Set prior knowledge and target score",
                "Generate a DB-backed daily plan",
              ].map((item) => (
                <div key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-300" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-xl border border-slate-700 bg-slate-800/70 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-300">
                What You Control
              </p>
              <p className="mt-1 text-sm text-slate-100">
                Exam date, target marks range, topic confidence, and completion
                feedback. The plan updates with your progress.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            title: "Adaptive Planning",
            desc: "Priority, difficulty, and study hours tuned per topic.",
            icon: Target,
          },
          {
            title: "LLM Extraction",
            desc: "Syllabus + PYQ driven high-yield topic identification.",
            icon: BrainCircuit,
          },
          {
            title: "Live Tracking",
            desc: "Completion and weak-topic visibility in one dashboard.",
            icon: ChartNoAxesCombined,
          },
          {
            title: "Assistant Support",
            desc: "Ask strategy questions and get focused guidance.",
            icon: BotMessageSquare,
          },
        ].map((card) => (
          <article
            key={card.title}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <card.icon className="h-5 w-5 text-indigo-700" />
            <h2 className={`${headingFont.className} mt-3 text-lg font-semibold text-slate-900`}>
              {card.title}
            </h2>
            <p className="mt-1 text-sm text-slate-600">{card.desc}</p>
          </article>
        ))}
      </section>

      <section className="mt-8 rounded-3xl border border-indigo-100 bg-gradient-to-r from-indigo-50 via-white to-cyan-50 p-6 sm:p-8">
        <h2 className={`${headingFont.className} text-2xl font-semibold text-slate-900`}>
          Built For Students Preparing For Real Exams
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600 sm:text-base">
          This platform is designed for exam timelines, not generic note-taking.
          From the first upload to final revision, each step is focused on scoring
          outcomes and reducing random study effort.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href={student ? "/study-plan" : "/register"}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-600"
          >
            {student ? "Start Study Plan Workflow" : "Get Started Now"}
            <ArrowRight className="h-4 w-4" />
          </Link>
          {!student ? (
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-medium text-indigo-800 hover:bg-indigo-50"
            >
              I already have an account
            </Link>
          ) : null}
        </div>
      </section>
    </main>
  );
}
