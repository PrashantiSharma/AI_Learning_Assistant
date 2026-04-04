"use client";

import { FormEvent, useState } from "react";
import { Bot, SendHorizonal, Sparkles, UserRound } from "lucide-react";

type Message = { role: "user" | "assistant"; content: string };

const suggestions = [
  "Create a 3-day revision strategy for my weakest topics.",
  "How should I split problem solving vs theory today?",
  "Suggest a rapid recovery plan before my next exam.",
];

export default function AssistantPage() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendMessage(e?: FormEvent) {
    e?.preventDefault();
    if (!message.trim() || loading) return;

    const input = message.trim();
    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setMessage("");
    setLoading(true);
    setError(null);

    try {
      const seedRes = await fetch("/api/seed-info");
      const seedInfo = await seedRes.json();
      if (!seedRes.ok) throw new Error(seedInfo.error ?? "Could not load student context");

      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: seedInfo.studentId, message: input }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? "Assistant failed");

      setMessages((prev) => [...prev, { role: "assistant", content: data.reply ?? "No reply generated." }]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to reach assistant.";
      setError(message);
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${message}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:py-10">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/40">
        <header className="border-b border-slate-200 bg-gradient-to-r from-slate-900 via-indigo-900 to-cyan-800 px-6 py-5 text-white">
          <p className="text-xs uppercase tracking-[0.14em] text-cyan-100">LLM API Integration</p>
          <h1 className="mt-1 text-2xl font-semibold">LLM Study Assistant</h1>
          <p className="mt-1 text-sm text-slate-100/90">Ask for strategy, weak-topic reinforcement, and exam-focused guidance.</p>
        </header>

        <div className="grid gap-4 p-5 sm:p-6">
          <div className="flex flex-wrap gap-2">
            {suggestions.map((text) => (
              <button
                key={text}
                onClick={() => setMessage(text)}
                className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
              >
                {text}
              </button>
            ))}
          </div>

          <section className="h-[440px] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-4">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <Sparkles className="h-6 w-6 text-slate-400" />
                <p className="mt-2 text-sm font-medium text-slate-700">Start a conversation with the LLM Study Assistant</p>
                <p className="mt-1 text-xs text-slate-500">Use a suggested prompt or ask your own question.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg, i) => (
                  <article
                    key={`${msg.role}-${i}`}
                    className={`max-w-[90%] rounded-2xl px-4 py-3 shadow-sm ${
                      msg.role === "user"
                        ? "ml-auto bg-slate-900 text-white"
                        : "mr-auto border border-slate-200 bg-white text-slate-800"
                    }`}
                  >
                    <p className="mb-1 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide opacity-80">
                      {msg.role === "user" ? <UserRound className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                      {msg.role === "user" ? "You" : "LLM Study Assistant"}
                    </p>
                    <p className="text-sm leading-7 whitespace-pre-line">{msg.content}</p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <form onSubmit={sendMessage} className="flex flex-col gap-3 sm:flex-row">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ask about weak topics, revision schedule, or exam prep..."
              className="min-h-12 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
            />
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              <SendHorizonal className="h-4 w-4" />
              {loading ? "Sending..." : "Send"}
            </button>
          </form>

          {error && <p className="text-xs text-rose-600">{error}</p>}
        </div>
      </div>
    </main>
  );
}
