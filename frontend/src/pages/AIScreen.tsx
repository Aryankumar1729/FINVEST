import { useState, useRef, useEffect } from "react";
import { Bot, Send, CircleDot, Sparkles, TrendingUp, Target, Receipt, BarChart2, Loader2 } from "lucide-react";
import { SectionHeader } from "../components/ui";
import { postChat } from "../lib/api";
type ChatRole = "user" | "bot" | "system";

interface ChatMessage {
  id: string;
  from: ChatRole;
  text: string;
  /** Soft telemetry only — tool names without :ok/:error. */
  tools?: string[];
}

const welcome: ChatMessage = {
  id: "welcome",
  from: "bot",
  text: "Hi! I can answer questions about your portfolio, goals, tax, and markets using live tools when needed. What do you need?",
};

const suggestions = [
  { label: "Portfolio summary", icon: <BarChart2 size={12} /> },
  { label: "What is my unpaid tax?", icon: <Receipt size={12} /> },
  { label: "What are my goals?", icon: <Target size={12} /> },
  { label: "Current price of RELIANCE.NS", icon: <TrendingUp size={12} /> },
];

const capabilities = [
  { icon: <BarChart2 size={18} />, title: "Portfolio Analysis", desc: "Real-time breakdown of holdings, gains, sector exposure" },
  { icon: <Target size={18} />, title: "Goal Planning", desc: "Track financial goals and progress from your live snapshot" },
  { icon: <Receipt size={18} />, title: "Tax Insights", desc: "Salary tax estimates and capital-gains context when tools apply" },
  { icon: <TrendingUp size={18} />, title: "Market Insights", desc: "Live stock prices, FD rates, and related lookups" },
];

function toolDisplayNames(raw: string[]): string[] {
  const names = raw
    .map((t) => t.replace(/:(ok|error)$/i, "").trim())
    .filter(Boolean);
  return [...new Set(names)];
}

export function AIScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([welcome]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || sending) return;

    setInput("");
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      from: "user",
      text: msg,
    };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);

    try {
      let res;
      let restarted = false;
      try {
        res = await postChat(msg, conversationId);
      } catch (firstErr) {
        if (conversationId) {
          restarted = true;
          res = await postChat(msg, null);
        } else {
          throw firstErr;
        }
      }

      setConversationId(res.conversation_id);
      const tools = toolDisplayNames(res.tool_calls_made ?? []);
      const botMsg: ChatMessage = {
        id: `b-${Date.now()}`,
        from: "bot",
        text: res.reply,
        tools: tools.length ? tools : undefined,
      };
      setMessages((prev) => {
        const next = [...prev, botMsg];
        if (restarted) {
          next.push({
            id: `s-${Date.now()}`,
            from: "system",
            text: "Started a new conversation (previous session was unavailable).",
          });
        }
        return next;
      });
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : "Something went wrong";
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          from: "system",
          text: `Something went wrong — try again. (${detail})`,
        },
      ]);
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-8 pt-8 pb-5 shrink-0 border-b border-white/[0.05]">
        <div className="flex items-center justify-between">
          <SectionHeader eyebrow="Assistant" title="AI Assistant" />
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-[10px] font-semibold text-primary tracking-wider uppercase">Ready</span>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-8 py-6 flex flex-col gap-4" style={{ scrollbarWidth: "none" }}>
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col gap-1.5 ${
                  m.from === "user" ? "items-end" : m.from === "system" ? "items-center" : "items-start"
                }`}
              >
                {m.from === "bot" && (
                  <div className="flex items-center gap-2 mb-0.5">
                    <div className="w-5 h-5 rounded-md bg-primary/15 border border-primary/20 flex items-center justify-center">
                      <Bot size={10} className="text-primary" />
                    </div>
                    <span className="text-[10px] font-semibold text-muted-foreground">Finvest AI</span>
                  </div>
                )}
                {m.from === "system" ? (
                  <p className="text-[11px] text-muted-foreground/80 italic px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.06]">
                    {m.text}
                  </p>
                ) : (
                  <div
                    className={`max-w-[72%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                      m.from === "user"
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-white/[0.05] border border-white/[0.07] text-foreground rounded-bl-sm"
                    }`}
                  >
                    {m.text}
                  </div>
                )}
                {m.from === "bot" && m.tools && m.tools.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.tools.map((name) => (
                      <div
                        key={name}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.06]"
                      >
                        <CircleDot size={8} className="text-primary" />
                        <span className="text-[10px] text-muted-foreground font-medium">Used: {name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {sending && (
              <div className="flex flex-col gap-1.5 items-start">
                <div className="flex items-center gap-2 mb-0.5">
                  <div className="w-5 h-5 rounded-md bg-primary/15 border border-primary/20 flex items-center justify-center">
                    <Bot size={10} className="text-primary" />
                  </div>
                  <span className="text-[10px] font-semibold text-muted-foreground">Finvest AI</span>
                </div>
                <div className="flex items-center gap-2 max-w-[72%] px-4 py-3 rounded-2xl bg-white/[0.05] border border-white/[0.07] text-muted-foreground rounded-bl-sm text-sm">
                  <Loader2 size={14} className="animate-spin text-primary" />
                  Thinking…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="px-8 pb-3 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {suggestions.map((s) => (
              <button
                key={s.label}
                type="button"
                disabled={sending}
                onClick={() => void send(s.label)}
                className="shrink-0 flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.07] text-muted-foreground hover:text-foreground hover:border-white/20 transition-colors disabled:opacity-40"
              >
                <span className="text-primary/70">{s.icon}</span>
                {s.label}
              </button>
            ))}
          </div>

          <div className="px-8 pb-8">
            <div className="flex gap-3 bg-white/[0.04] border border-white/[0.09] rounded-2xl px-4 py-3.5 items-center focus-within:border-white/20 transition-colors">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder="Ask or instruct the AI…"
                disabled={sending}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={!input.trim() || sending}
                className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center hover:opacity-90 active:scale-95 transition-all shrink-0 disabled:opacity-40"
              >
                <Send size={13} className="text-primary-foreground" />
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground/50 text-center mt-2">
              Answers use your live snapshot; market/tax tools run when needed. Read-only — it won&apos;t buy or sell for you.
            </p>
          </div>
        </div>

        <div className="w-[260px] shrink-0 border-l border-white/[0.05] px-5 py-6 flex flex-col gap-5 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
          <div className="flex items-center gap-2">
            <Sparkles size={12} className="text-primary" />
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Capabilities</p>
          </div>
          <div className="flex flex-col gap-3">
            {capabilities.map((c) => (
              <div key={c.title} className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className="flex items-center gap-2.5 mb-1.5">
                  <span className="text-primary/70">{c.icon}</span>
                  <p className="text-xs font-semibold text-foreground">{c.title}</p>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{c.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-auto p-3.5 rounded-xl bg-primary/[0.06] border border-primary/15">
            <p className="text-[11px] font-semibold text-primary mb-1">Live Q&amp;A</p>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Each message is a single request. Conversation continues when the same session id is reused.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
