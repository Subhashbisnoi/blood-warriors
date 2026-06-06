import { useState, useRef, useEffect, FormEvent } from 'react';
import TopBar from '../components/layout/TopBar';
import { sendMessage, getChatHistory } from '../api/chat';
import type { ChatMessage } from '../types';

const DEMO_USER_ID = 'demo_donor_001';
const FLOWS = ['Outreach', 'Reminder', 'Post-Donation', 'Re-engage'] as const;

export default function ChatAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [flow, setFlow] = useState<string>('Outreach');
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    getChatHistory(DEMO_USER_ID)
      .then(hist => { if (hist.length) setMessages(hist); })
      .catch(console.error);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend(e?: FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);
    if (textareaRef.current) { textareaRef.current.style.height = 'auto'; }

    try {
      const res = await sendMessage(DEMO_USER_ID, text, flow.toLowerCase().replace('-', '_'), sessionId);
      if (res.session_id) setSessionId(res.session_id);
      const aiMsg: ChatMessage = { role: 'assistant', content: res.reply, intent: res.intent, timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, aiMsg]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '⚠ Unable to reach AI assistant. Please try again.' }]);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  function handleInput() {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  }

  return (
    <div className="flex flex-col h-full relative">
      <TopBar title="AI Chat Assistant" />
      <div className="flex-1 flex justify-center items-stretch p-md md:p-lg overflow-hidden relative" style={{ background: '#fff8f7 url("data:image/svg+xml,%3Csvg width=\'40\' height=\'40\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Ccircle cx=\'20\' cy=\'20\' r=\'1\' fill=\'rgba(95%2C71%2C71%2C0.1)\'/%3E%3C/svg%3E")' }}>
        <div className="w-full max-w-4xl bg-surface rounded-xl border border-outline-variant shadow-sm flex flex-col overflow-hidden">

          {/* Chat header */}
          <div className="bg-gradient-to-r from-primary to-surface-tint p-lg flex justify-between items-start text-on-primary">
            <div>
              <div className="flex items-center gap-sm mb-xs">
                <span className="material-symbols-outlined icon-fill">smart_toy</span>
                <h2 className="text-headline-md font-bold tracking-tight">Blood Warriors AI Assistant</h2>
              </div>
              <div className="flex items-center gap-md mt-sm flex-wrap">
                <span className="inline-flex items-center gap-xs px-2.5 py-0.5 rounded-full bg-surface/20 border border-on-primary/30 text-label-sm font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-on-primary" /> Live Context
                </span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-[#E0E7FF] text-[#3730A3] text-label-sm font-bold border border-[#C7D2FE]">
                  O+ Bridge Donor
                </span>
                <span className="text-label-sm text-on-primary/80 flex items-center gap-xs">
                  <span className="material-symbols-outlined text-[14px]">history</span> History linked
                </span>
              </div>
            </div>
          </div>

          {/* Flow pills */}
          <div className="px-md py-sm border-b border-outline-variant bg-surface-container-lowest flex gap-sm overflow-x-auto hide-scrollbar">
            {FLOWS.map(f => (
              <button
                key={f}
                onClick={() => setFlow(f)}
                className={`px-md py-1.5 rounded-full text-label-sm font-medium whitespace-nowrap transition-colors ${flow === f ? 'bg-primary-container text-on-primary' : 'bg-surface-variant text-on-surface-variant hover:bg-secondary-container'}`}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-lg space-y-lg chat-scroll bg-surface-bright flex flex-col">
            {messages.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center text-on-surface-variant gap-md">
                <span className="material-symbols-outlined text-[64px] text-outline">smart_toy</span>
                <p className="text-body-lg">Start a conversation with the AI assistant.</p>
                <div className="flex flex-wrap gap-sm justify-center">
                  {['Yes I can donate on the 23rd', 'Haan kar sakta hoon', 'मैं डोनेट कर सकता हूं'].map(s => (
                    <button key={s} onClick={() => setInput(s)} className="px-md py-sm rounded-full bg-surface-container border border-outline-variant text-label-md hover:bg-surface-variant transition-colors">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex items-start gap-sm max-w-[85%] ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${msg.role === 'assistant' ? 'bg-primary-container text-on-primary' : 'bg-secondary-container text-on-secondary-container border border-outline-variant/50'}`}>
                  <span className="material-symbols-outlined text-[18px]">{msg.role === 'assistant' ? 'smart_toy' : 'person'}</span>
                </div>
                <div className={`rounded-2xl p-md shadow-sm ${msg.role === 'assistant' ? 'bg-surface-container rounded-tl-sm border border-outline-variant/30 text-on-surface' : 'bg-primary rounded-tr-sm text-on-primary'}`}>
                  <p className="text-body-md whitespace-pre-wrap">{msg.content}</p>
                  {msg.intent && msg.intent !== 'NONE' && (
                    <span className="inline-block mt-sm px-2 py-0.5 rounded text-[10px] font-bold bg-surface-container-low text-on-surface-variant border border-outline-variant uppercase">
                      Intent: {msg.intent}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex items-start gap-sm max-w-[85%]">
                <div className="w-8 h-8 rounded-full bg-primary-container text-on-primary flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px]">smart_toy</span>
                </div>
                <div className="bg-surface-container rounded-2xl rounded-tl-sm p-md border border-outline-variant/30 flex gap-1">
                  {[0, 1, 2].map(d => (
                    <div key={d} className="w-2 h-2 rounded-full bg-on-surface-variant animate-bounce" style={{ animationDelay: `${d * 0.15}s` }} />
                  ))}
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSend} className="p-md bg-surface border-t border-outline-variant">
            <div className="flex items-center gap-1 mb-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-secondary-container text-on-secondary-container border border-outline-variant/50">
                <span className="material-symbols-outlined text-[12px]">translate</span>
                Auto-detect language
              </span>
            </div>
            <div className="flex items-end gap-sm">
              <div className="flex-1 relative">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onInput={handleInput}
                  placeholder="Type your message… (Enter to send)"
                  className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl py-sm pl-md pr-10 focus:ring-2 focus:ring-primary focus:border-primary resize-none text-body-md text-on-surface placeholder:text-secondary-fixed-dim shadow-sm outline-none"
                  style={{ maxHeight: 200, overflowY: 'auto' }}
                />
              </div>
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="w-12 h-12 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0 hover:bg-primary-container transition-colors shadow-sm disabled:opacity-50"
              >
                <span className="material-symbols-outlined">send</span>
              </button>
            </div>
          </form>
        </div>
        {/* Floating chat bubble */}
        <div className="absolute bottom-lg right-lg z-50 animate-bounce cursor-pointer group">
          <div className="w-14 h-14 bg-primary text-on-primary rounded-full shadow-lg flex items-center justify-center group-hover:scale-110 transition-transform">
            <span className="material-symbols-outlined text-[28px]">chat</span>
          </div>
          <div className="absolute top-0 right-0 w-4 h-4 bg-error rounded-full border-2 border-surface" />
        </div>
      </div>
    </div>
  );
}
