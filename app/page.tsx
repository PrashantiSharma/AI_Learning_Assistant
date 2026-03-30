import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="rounded-3xl bg-white p-10 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
            AI-Powered Learning Assistant
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-900">
            Personalized study plans, topic prioritization, and an AI helper in one app.
          </h1>
          <p className="mt-4 max-w-3xl text-base text-slate-600">
            This scaffold includes a Next.js frontend, API routes, Prisma models, and a FastAPI
            machine learning service to score study priorities and generate adaptive plans.
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/dashboard"
              className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white"
            >
              Open Dashboard
            </Link>
            <Link
              href="/assistant"
              className="rounded-2xl border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700"
            >
              Open Assistant
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
