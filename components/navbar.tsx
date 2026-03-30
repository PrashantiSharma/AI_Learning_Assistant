import Link from "next/link";

export function Navbar() {
  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold text-slate-900">
          AI Learning Assistant
        </Link>
        <div className="flex gap-4 text-sm text-slate-600">
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/study-plan">Study Plan</Link>
          <Link href="/assistant">Assistant</Link>
        </div>
      </div>
    </nav>
  );
}
