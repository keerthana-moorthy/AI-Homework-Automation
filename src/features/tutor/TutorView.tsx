import React, { useEffect, useRef, useState } from 'react';
import {
  Bot,
  User,
  Send,
  PlusCircle,
  History,
  Trash2,
  Sparkles,
  X,
  Loader2,
} from 'lucide-react';
import { useAppSelector } from '../../store';
import Button from '../../components/common/Button';
import {
  chatDoubt,
  type ExplanationChatMessage,
} from '../../services/api';
import AIResponseRenderer from '../../components/common/AIResponseRenderer';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  streamed?: boolean;
}

interface ChatThread {
  id: string;
  title: string;
  messages: ChatMessage[];
  threadId: number | null;
  timestamp: number;
}

const createId = (prefix: string) => {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
};

export const TutorView: React.FC = () => {
  const language = useAppSelector((state) => state.app.language);

  // Chat State
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const listEndRef = useRef<HTMLDivElement>(null);

  // 1. Initialize and Load Threads from LocalStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const stored = window.localStorage.getItem('vidya-ai-tutor-threads-general');
      if (stored) {
        const parsed = JSON.parse(stored) as ChatThread[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setThreads(parsed);
          const sorted = [...parsed].sort((a, b) => b.timestamp - a.timestamp);
          setActiveThreadId(sorted[0].id);
          return;
        }
      }
    } catch (e) {
      console.warn('Failed to load chat threads', e);
    }

    // Default Thread if none exists
    const defaultThread: ChatThread = {
      id: createId('thread'),
      title: 'General Study Session',
      messages: [],
      threadId: null,
      timestamp: Date.now(),
    };
    setThreads([defaultThread]);
    setActiveThreadId(defaultThread.id);
  }, []);

  // 2. Persist Threads to LocalStorage
  useEffect(() => {
    if (threads.length === 0) return;
    window.localStorage.setItem('vidya-ai-tutor-threads-general', JSON.stringify(threads));
  }, [threads]);

  // 3. Scroll to Bottom
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threads, activeThreadId, isSending]);

  const activeThread = threads.find((t) => t.id === activeThreadId) || null;

  // Create a new empty chat session
  const handleNewChat = () => {
    const newThread: ChatThread = {
      id: createId('thread'),
      title: 'General Study Session',
      messages: [],
      threadId: null,
      timestamp: Date.now(),
    };
    setThreads((current) => [newThread, ...current]);
    setActiveThreadId(newThread.id);
    setIsHistoryOpen(false);
  };

  // Select a past thread
  const handleSelectThread = (thread: ChatThread) => {
    setActiveThreadId(thread.id);
    setIsHistoryOpen(false);
  };

  // Delete a thread
  const handleDeleteThread = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = threads.filter((t) => t.id !== id);
    if (updated.length === 0) {
      const defaultThread: ChatThread = {
        id: createId('thread'),
        title: 'General Study Session',
        messages: [],
        threadId: null,
        timestamp: Date.now(),
      };
      setThreads([defaultThread]);
      setActiveThreadId(defaultThread.id);
    } else {
      setThreads(updated);
      if (activeThreadId === id) {
        setActiveThreadId(updated[0].id);
      }
    }
  };

  // Submit doubt message
  const handleSendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isSending || !activeThreadId || !activeThread) return;

    const userMessage: ChatMessage = {
      id: createId('msg-user'),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };

    const updatedMessages = [...activeThread.messages, userMessage];
    setThreads((current) =>
      current.map((t) =>
        t.id === activeThreadId
          ? {
              ...t,
              messages: updatedMessages,
              timestamp: Date.now(),
              title: t.messages.length === 0 ? (trimmed.length > 30 ? trimmed.slice(0, 30) + '...' : trimmed) : t.title,
            }
          : t
      )
    );
    setInput('');
    setIsSending(true);
    setError(null);

    const apiHistory: ExplanationChatMessage[] = activeThread.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const response = await chatDoubt({
        analysisId: -1, // -1 signals General Knowledge Mode to the backend
        message: trimmed,
        history: apiHistory,
        language,
        threadId: activeThread.threadId,
      });

      const assistantMessage: ChatMessage = {
        id: createId('msg-bot'),
        role: 'assistant',
        content: response.reply,
        timestamp: Date.now(),
        streamed: false,
      };

      setThreads((current) =>
        current.map((t) =>
          t.id === activeThreadId
            ? {
                ...t,
                messages: [...updatedMessages, assistantMessage],
                threadId: response.threadId ?? t.threadId,
                timestamp: Date.now(),
              }
            : t
        )
      );
    } catch (err) {
      console.error('Failed to get bot reply', err);
      setError(err instanceof Error ? err.message : 'Unable to reach the tutor bot right now.');
      const errorMsg: ChatMessage = {
        id: createId('msg-bot-err'),
        role: 'assistant',
        content: 'Oops! I encountered an error answering your question. Please verify your connection and try again.',
        timestamp: Date.now(),
        streamed: false,
      };
      setThreads((current) =>
        current.map((t) =>
          t.id === activeThreadId
            ? {
                ...t,
                messages: [...updatedMessages, errorMsg],
                timestamp: Date.now(),
              }
            : t
        )
      );
    } finally {
      setIsSending(false);
    }
  };

  // Click handler for suggested topics
  const handleChipClick = (chip: string) => {
    switch (chip) {
      case 'Science':
        void handleSendMessage('Tell me about an interesting Science topic!');
        break;
      case 'Mathematics':
        void handleSendMessage('Explain an interesting Mathematics concept.');
        break;
      case 'English':
        void handleSendMessage('Help me learn a new English word and how to use it.');
        break;
      case 'General Knowledge':
        void handleSendMessage('Tell me a fun General Knowledge fact.');
        break;
      case 'History':
        void handleSendMessage('Tell me an interesting event from History.');
        break;
      case 'Geography':
        void handleSendMessage('What is an amazing fact about Geography?');
        break;
      default:
        void handleSendMessage(`Let's talk about ${chip}`);
    }
  };

  // Suggestion Topics (Chips)
  const suggestionChips = [
    'Science',
    'Mathematics',
    'English',
    'General Knowledge',
    'History',
    'Geography',
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] md:h-[calc(100vh-7rem)] bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden font-nunito relative">
      {/* 1. Header Toolbar */}
      <header className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0 bg-white z-10">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-purple text-white shadow-[0_4px_0_#5B3F87]">
            <Bot size={22} className="animate-[pulse_2s_infinite]" />
          </div>
          <div>
            <h3 className="text-sm md:text-base font-black text-gray-800 leading-tight">Vidya AI Tutor</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] text-gray-500 font-extrabold uppercase tracking-wide">Online Study Buddy</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* New Chat Button */}
          <button
            onClick={handleNewChat}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-black text-brand-purple bg-brand-purpleLight hover:bg-brand-purple/10 rounded-xl transition duration-150 border-none cursor-pointer"
            title="Start new chat"
          >
            <PlusCircle size={15} />
            <span className="hidden sm:inline">New Chat</span>
          </button>

          {/* Chat History Button */}
          <button
            onClick={() => setIsHistoryOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-black text-gray-600 hover:text-brand-purple hover:bg-gray-50 rounded-xl transition duration-150 border-none bg-transparent cursor-pointer"
            title="Open Chat History"
          >
            <History size={15} />
            <span className="hidden sm:inline">History</span>
          </button>
        </div>
      </header>

      {/* 2. Top Info Subheader */}
      <div className="px-5 py-2 bg-amber-50/70 border-b border-amber-100/40 flex items-center justify-between shrink-0 text-xs font-semibold text-gray-600">
        <div className="flex items-center gap-2">
          <Sparkles size={13} className="text-brand-amber animate-[spin_4s_linear_infinite]" />
          <span>Ask questions about any educational topic or chat about general knowledge!</span>
        </div>
      </div>

      {/* 3. Messages Window */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-gray-50/20">
        {/* Empty State */}
        {(!activeThread || activeThread.messages.length === 0) && (
          <div className="flex flex-col items-center justify-center text-center py-12 px-4 max-w-lg mx-auto space-y-6 animate-[fadeIn_0.2s_ease-out]">
            <div className="w-16 h-16 rounded-3xl bg-brand-purple/10 flex items-center justify-center text-4xl shadow-sm animate-bounce">
              🤖
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-800 leading-tight">
                Hi! I'm your AI Study Buddy.
              </h2>
              <p className="text-sm text-gray-500 font-bold mt-2 leading-relaxed">
                Ask me anything and I'll help you learn.
              </p>
            </div>

            {/* Suggested topics / chips */}
            <div className="w-full space-y-2">
              <div className="text-[10px] text-gray-400 font-black uppercase tracking-wider mb-1">
                Suggested Topics
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {suggestionChips.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => handleChipClick(chip)}
                    className="p-3 text-xs text-center font-black text-gray-700 bg-white border border-gray-100 hover:border-brand-purple hover:bg-brand-purpleLight hover:text-brand-purple rounded-2xl transition duration-150 shadow-sm cursor-pointer"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Message Feeds */}
        {activeThread &&
          activeThread.messages.map((message) => {
            const isUser = message.role === 'user';
            return (
              <div
                key={message.id}
                className={`flex items-start gap-3 animate-[fadeIn_0.2s_ease-out] ${
                  isUser ? 'justify-end' : 'justify-start'
                }`}
              >
                {!isUser && (
                  <div className="w-8 h-8 rounded-xl bg-brand-purple text-white flex items-center justify-center shrink-0 shadow-sm select-none">
                    <Bot size={16} />
                  </div>
                )}

                <div className="flex flex-col max-w-[80%]">
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm font-semibold leading-relaxed ${
                      isUser
                        ? 'bg-brand-purple text-white shadow-sm rounded-tr-none whitespace-pre-line'
                        : 'bg-white text-gray-800 border border-gray-100 shadow-sm rounded-tl-none'
                    }`}
                  >
                    {isUser ? (
                      message.content
                    ) : (
                      <AIResponseRenderer
                        content={message.content}
                        stream={message.streamed === false}
                        onStreamComplete={() => {
                          setThreads((current) =>
                            current.map((t) =>
                              t.id === activeThreadId
                                ? {
                                    ...t,
                                    messages: t.messages.map((m) =>
                                      m.id === message.id ? { ...m, streamed: true } : m
                                    ),
                                  }
                                : t
                            )
                          );
                        }}
                      />
                    )}
                  </div>

                  {/* Quick Action prompts below AI Responses */}
                  {!isUser && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <button
                        onClick={() => void handleSendMessage('Explain this in more detail')}
                        className="px-2.5 py-1 text-[10px] font-extrabold text-brand-purple hover:bg-brand-purpleLight rounded-lg border border-brand-purpleBorder cursor-pointer transition bg-white"
                      >
                        Explain More
                      </button>
                      <button
                        onClick={() => void handleSendMessage('Can you give me an example?')}
                        className="px-2.5 py-1 text-[10px] font-extrabold text-brand-purple hover:bg-brand-purpleLight rounded-lg border border-brand-purpleBorder cursor-pointer transition bg-white"
                      >
                        Give Example
                      </button>
                      <button
                        onClick={() => void handleSendMessage('Simplify this explanation')}
                        className="px-2.5 py-1 text-[10px] font-extrabold text-brand-purple hover:bg-brand-purpleLight rounded-lg border border-brand-purpleBorder cursor-pointer transition bg-white"
                      >
                        Simplify
                      </button>
                      <button
                        onClick={() => void handleSendMessage('Ask me a quiz question about this concept')}
                        className="px-2.5 py-1 text-[10px] font-extrabold text-brand-purple hover:bg-brand-purpleLight rounded-lg border border-brand-purpleBorder cursor-pointer transition bg-white"
                      >
                        Create Quiz
                      </button>
                    </div>
                  )}
                </div>

                {isUser && (
                  <div className="w-8 h-8 rounded-xl bg-brand-orange text-white flex items-center justify-center shrink-0 shadow-sm select-none">
                    <User size={16} />
                  </div>
                )}
              </div>
            );
          })}

        {isSending && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-brand-purple text-white flex items-center justify-center shrink-0 shadow-sm">
              <Bot size={16} />
            </div>
            <div className="flex flex-col">
              <AIResponseRenderer content="" loading={true} />
            </div>
          </div>
        )}

        <div ref={listEndRef} />
      </div>

      {/* 4. Chat Input Dock */}
      <footer className="p-4 border-t border-gray-100 bg-white shrink-0">
        {error && (
          <div className="mb-3 px-4 py-2 bg-red-50 text-red-700 text-xs font-bold rounded-xl border border-red-100 flex items-center justify-between">
            <span>Error: {error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-700 border-none bg-transparent cursor-pointer font-black"
            >
              ✕
            </button>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim() && !isSending) {
              void handleSendMessage(input);
            }
          }}
          className="flex gap-2.5 items-end"
        >
          <div className="flex-1 bg-gray-50 rounded-2xl border border-gray-150 px-4 py-2 flex items-center">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything about any subject..."
              rows={Math.min(4, input.split('\n').length || 1)}
              disabled={isSending}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (input.trim() && !isSending) {
                    void handleSendMessage(input);
                  }
                }
              }}
              className="flex-1 resize-none bg-transparent border-none outline-none text-sm text-gray-700 font-semibold placeholder-gray-400 max-h-32"
            />
          </div>

          <Button
            type="submit"
            variant="blue"
            disabled={isSending || !input.trim()}
            className="h-[42px] px-5 flex items-center gap-1.5 shrink-0 rounded-2xl"
          >
            {isSending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={15} />
            )}
            <span className="hidden sm:inline">{isSending ? 'Sending...' : 'Ask'}</span>
          </Button>
        </form>
      </footer>

      {/* 5. Chat History Sliding Drawer */}
      {isHistoryOpen && (
        <div className="absolute inset-0 z-30 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-xs transition-opacity"
            onClick={() => setIsHistoryOpen(false)}
          />

          {/* Drawer Panel */}
          <aside className="relative w-80 max-w-[85vw] h-full bg-white shadow-2xl flex flex-col z-10 animate-[slideInRight_0.2s_ease-out]">
            <header className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h4 className="text-sm font-black text-gray-800 flex items-center gap-2">
                <History size={16} className="text-brand-purple" />
                Chat History
              </h4>
              <button
                onClick={() => setIsHistoryOpen(false)}
                className="p-1 hover:bg-gray-100 rounded-lg border-none bg-transparent cursor-pointer text-gray-500"
              >
                <X size={18} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {threads.map((thread) => {
                const isActive = thread.id === activeThreadId;
                const lastMsg = thread.messages[thread.messages.length - 1];
                return (
                  <div
                    key={thread.id}
                    onClick={() => handleSelectThread(thread)}
                    className={`group w-full flex items-center justify-between p-3 rounded-2xl text-left cursor-pointer transition ${
                      isActive
                        ? 'bg-brand-purpleLight border border-brand-purple/20 text-brand-purple'
                        : 'hover:bg-gray-50 border border-transparent text-gray-600'
                    }`}
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="text-xs font-black truncate">{thread.title}</div>
                      <div className="text-[10px] text-gray-400 font-bold mt-1">
                        {lastMsg ? lastMsg.content.slice(0, 35) + '...' : 'No messages'}
                      </div>
                    </div>

                    <button
                      onClick={(e) => handleDeleteThread(thread.id, e)}
                      className="p-1.5 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 border-none bg-transparent transition duration-150 cursor-pointer"
                      title="Delete thread"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>

            <footer className="p-4 border-t border-gray-100">
              <Button
                variant="primary"
                onClick={handleNewChat}
                className="w-full flex items-center gap-2 py-3"
              >
                <PlusCircle size={16} />
                New Chat Thread
              </Button>
            </footer>
          </aside>
        </div>
      )}
    </div>
  );
};

export default TutorView;
