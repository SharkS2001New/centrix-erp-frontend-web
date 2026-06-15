"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { isAiAssistantAvailable } from "@/lib/ai-settings";
import { P } from "@/lib/permission-codes";

const STARTERS = {
  products: [
    "Which products are low on stock?",
    "Summarize my catalog health.",
    "What should I reorder this week?",
  ],
  reports: [
    "How are sales trending this month?",
    "Which report shows outstanding receivables?",
    "Summarize sales by channel.",
  ],
  report_builder: [
    "Help me build a sales-by-product report.",
    "What fields can I group sales data by?",
    "Suggest KPIs for a customer balance report.",
  ],
  general: ["What can you help me with in this ERP?"],
};

export function AiAssistPanel({ context = "general", title = "AI assistant" }) {
  const { hasPermission, capabilities } = useAuth();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);

  const canUse = hasPermission(P.ai.assist.create);
  const orgAvailable = isAiAssistantAvailable(capabilities);

  useEffect(() => {
    if (!canUse || !orgAvailable) return;
    apiRequest("/ai/status")
      .then(setStatus)
      .catch(() => setStatus({ enabled: false }));
  }, [canUse, orgAvailable]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const send = useCallback(
    async (text) => {
      const message = text.trim();
      if (!message || loading) return;
      setError(null);
      setLoading(true);
      setMessages((prev) => [...prev, { role: "user", content: message }]);
      setInput("");
      try {
        const history = messages.slice(-8);
        const res = await apiRequest("/ai/chat", {
          method: "POST",
          body: { context, message, history },
        });
        setMessages((prev) => [...prev, { role: "assistant", content: res.reply }]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "AI request failed");
      } finally {
        setLoading(false);
      }
    },
    [context, loading, messages],
  );

  if (!canUse || !orgAvailable) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg transition hover:bg-indigo-700"
        title={title}
        aria-label="Open AI assistant"
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.847-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.847a4.5 4.5 0 003.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"
          />
        </svg>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20">
          <div className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="font-semibold text-slate-900">{title}</h2>
                <p className="text-xs text-slate-500">
                  {status?.enabled === false
                    ? "Not configured for this organization — ask an admin to enable AI under Settings → AI."
                    : status
                      ? "Powered by live ERP data"
                      : "Checking…"}
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-slate-500 hover:text-slate-800">
                ✕
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-sm text-slate-600">Try one of these:</p>
                  {(STARTERS[context] ?? STARTERS.general).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => send(q)}
                      className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              ) : null}

              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`rounded-lg px-3 py-2 text-sm ${
                    m.role === "user" ? "ml-8 bg-indigo-50 text-indigo-900" : "mr-4 bg-slate-100 text-slate-800"
                  }`}
                >
                  {m.content}
                </div>
              ))}

              {loading ? <p className="text-xs text-slate-500">Thinking…</p> : null}
              {error ? <p className="text-xs text-red-600">{error}</p> : null}
              <div ref={bottomRef} />
            </div>

            <form
              className="border-t border-slate-200 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
            >
              <div className="flex gap-2">
                <input
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Ask about your data…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
