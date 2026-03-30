"use client";

import { useState } from "react";

type Message = { role: string; content: string };

export default function AssistantPage() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  async function sendMessage() {
    if (!message.trim()) return;

    const seedRes = await fetch("/api/seed-info");
    const seedInfo = await seedRes.json();

    const userMessage = { role: "user", content: message };
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: seedInfo.studentId, message }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply ?? data.error }]);
      setMessage("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-4xl rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-2xl font-bold">AI Study Assistant</h1>
        <div className="mt-6 space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`rounded-xl p-4 ${msg.role === "user" ? "bg-slate-100" : "bg-blue-50"}`}
            >
              <p className="text-sm font-medium capitalize">{msg.role}</p>
              <p className="mt-1 text-sm text-slate-700">{msg.content}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 flex gap-3">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ask about weak topics, revision plan, or exam prep..."
            className="flex-1 rounded-xl border border-slate-300 px-4 py-3"
          />
          <button
            onClick={sendMessage}
            disabled={loading}
            className="rounded-xl bg-slate-900 px-5 py-3 text-white"
          >
            {loading ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </main>
  );
}
