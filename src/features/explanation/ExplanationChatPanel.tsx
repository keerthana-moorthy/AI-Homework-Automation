import React, { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, RotateCcw, Send, Sparkles, User } from 'lucide-react';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import { useAppSelector } from '../../store';
import { chatExplanation, type ExplanationChatMessage, type ExplanationPayload } from '../../services/api';

interface ChatEntry {
  id: string;
  role: 'assistant' | 'user';
  content: string;
}

interface ExplanationChatPanelProps {
  explanation: ExplanationPayload | null;
}

const createId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const getScanLabel = (scanMethod?: string, sourceType?: string) => {
  const normalizedMethod = scanMethod?.toLowerCase();
  const normalizedSource = sourceType?.toLowerCase();

  if (normalizedSource?.includes('handwritten')) {
    return 'Handwritten scan';
  }
  if (normalizedMethod === 'pdf-text' || normalizedSource?.includes('pdf')) {
    return 'PDF OCR';
  }
  if (normalizedMethod === 'groq-vision') {
    return 'Vision scan';
  }
  if (normalizedMethod === 'easyocr' || normalizedSource?.includes('image')) {
    return 'Image scan';
  }
  return 'Uploaded text';
};

const buildGreeting = (explanation: ExplanationPayload | null) => {
  const hasGroundedContent = Boolean(
    explanation?.analysisId
      || explanation?.extractedText
      || explanation?.summary
      || explanation?.detailedExplanation
      || (explanation?.steps?.length ?? 0) > 0
      || explanation?.fileUrl
  );
  const question = explanation?.question?.trim();
  const summary = explanation?.summary?.trim();

  if (hasGroundedContent && question) {
    return `I can help with the scanned homework question: "${question}". Ask me to explain any step, the OCR text, the summary, or the final answer.`;
  }

  if (hasGroundedContent && summary) {
    return 'I can explain the scanned homework, the OCR text, and every solution step. Ask me anything about the scan section or the answer.';
  }

  return 'Upload a handwritten or scanned PDF or image and I will explain it here.';
};

const buildSuggestions = (explanation: ExplanationPayload | null) => {
  const hasGroundedContent = Boolean(
    explanation?.analysisId
      || explanation?.extractedText
      || explanation?.summary
      || explanation?.detailedExplanation
      || (explanation?.steps?.length ?? 0) > 0
      || explanation?.fileUrl
  );
  const suggestions = [
    'Explain this homework in simple words',
    'What did the scan read from my file?',
    'Give me one similar practice question',
  ];

  const steps = hasGroundedContent ? explanation?.steps ?? [] : [];
  const finalAnswer = hasGroundedContent ? explanation?.finalAnswer?.trim() : undefined;
  const question = hasGroundedContent ? explanation?.question?.trim() : undefined;

  if (steps.length > 0) {
    suggestions.splice(1, 0, 'Explain step 1 clearly');
    if (steps.length > 1) {
      suggestions.splice(2, 0, 'Explain step 2 clearly');
    }
  }

  if (finalAnswer) {
    suggestions.push(`Why is the final answer ${finalAnswer}?`);
  }
  if (question) {
    suggestions.push(`Restate the question in simple words`);
  }
  if (hasGroundedContent && explanation?.summary) {
    suggestions.push('What does the scan summary mean?');
  }

  const deduped: string[] = [];
  suggestions.forEach((item) => {
    if (!deduped.includes(item)) {
      deduped.push(item);
    }
  });

  return deduped.slice(0, 5);
};

const toHistory = (messages: ChatEntry[]): ExplanationChatMessage[] =>
  messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));

export const ExplanationChatPanel: React.FC<ExplanationChatPanelProps> = ({ explanation }) => {
  const language = useAppSelector((state) => state.app.language);
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>(() => buildSuggestions(explanation));
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  const storageKey = `vidya-explanation-chat-${explanation?.analysisId ?? 'draft'}`;
  const scanLabel = getScanLabel(explanation?.scanMethod, explanation?.sourceType);
  const canChat = Boolean(
    explanation?.analysisId
      || explanation?.extractedText
      || explanation?.summary
      || explanation?.detailedExplanation
      || (explanation?.steps?.length ?? 0) > 0
      || explanation?.fileUrl
  );

  useEffect(() => {
    const starterMessage: ChatEntry = {
      id: createId('assistant'),
      role: 'assistant',
      content: buildGreeting(explanation),
    };
    setHydratedKey(null);

    if (typeof window === 'undefined') {
      setMessages([starterMessage]);
      setSuggestions(buildSuggestions(explanation));
      setInput('');
      setError(null);
      setHydratedKey(storageKey);
      return;
    }

    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const validMessages = parsed
            .filter((item): item is ChatEntry => {
              return Boolean(
                item
                && typeof item === 'object'
                && (item as ChatEntry).id
                && ((item as ChatEntry).role === 'user' || (item as ChatEntry).role === 'assistant')
                && typeof (item as ChatEntry).content === 'string'
              );
            })
            .slice(-20);

          if (validMessages.length > 0) {
            setMessages(validMessages);
          } else {
            setMessages([starterMessage]);
          }
        } else {
          setMessages([starterMessage]);
        }
      } else {
        setMessages([starterMessage]);
      }
    } catch (storageError) {
      console.warn('Unable to load chat history', storageError);
      setMessages([starterMessage]);
    } finally {
      setSuggestions(buildSuggestions(explanation));
      setInput('');
      setError(null);
      setHydratedKey(storageKey);
    }
  }, [explanation?.analysisId, explanation?.question, explanation?.summary, explanation?.detailedExplanation, explanation?.scanMethod, explanation?.sourceType, storageKey]);

  useEffect(() => {
    if (typeof window === 'undefined' || hydratedKey !== storageKey) {
      return;
    }
    window.localStorage.setItem(storageKey, JSON.stringify(messages.slice(-20)));
  }, [messages, storageKey, hydratedKey]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isSending]);

  const handleReset = () => {
    const starterMessage: ChatEntry = {
      id: createId('assistant'),
      role: 'assistant',
      content: buildGreeting(explanation),
    };
    setMessages([starterMessage]);
    setInput('');
    setError(null);
    setSuggestions(buildSuggestions(explanation));
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(storageKey);
    }
  };

  const submitMessage = async (rawMessage: string) => {
    const message = rawMessage.trim();
    if (!message || isSending || !canChat) {
      return;
    }

    const history = toHistory(messages);
    const userMessage: ChatEntry = {
      id: createId('user'),
      role: 'user',
      content: message,
    };

    setMessages((current) => [...current, userMessage]);
    setInput('');
    setIsSending(true);
    setError(null);

    try {
      const response = await chatExplanation({
        analysisId: explanation?.analysisId ?? null,
        message,
        history,
        language,
      });

      const assistantMessage: ChatEntry = {
        id: createId('assistant'),
        role: 'assistant',
        content: response.reply,
      };

      setMessages((current) => [...current, assistantMessage]);
      if (response.suggestedQuestions?.length) {
        setSuggestions(response.suggestedQuestions);
      }
    } catch (chatError) {
      const fallbackReply = 'I could not reach the homework tutor right now. Please try again in a moment.';
      setError(chatError instanceof Error ? chatError.message : 'Unable to talk to the tutor right now.');
      setMessages((current) => [
        ...current,
        {
          id: createId('assistant'),
          role: 'assistant',
          content: fallbackReply,
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="rounded-3xl border border-[#E6DAF5] bg-gradient-to-br from-[#FBF8FF] via-white to-[#FFF9F2] p-5 shadow-sm space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-purple text-white shadow-[0_4px_0_#5B3F87]">
            <Bot size={19} />
          </div>
          <div>
            <h4 className="text-sm font-black text-gray-800">Homework Doubt Bot</h4>
            <p className="text-xs font-semibold text-gray-500 leading-5">
              Ask about the scan, OCR text, summary, detailed explanation, or any step.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="default" className="bg-white">
            <Sparkles size={12} />
            Scan aware
          </Badge>
          <Badge variant="white">{scanLabel}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div className="flex flex-wrap gap-2">
          {suggestions.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => void submitMessage(prompt)}
              disabled={isSending || !canChat}
              className="rounded-full border border-[#E6DAF5] bg-white px-3 py-2 text-left text-[11px] font-extrabold text-gray-600 shadow-sm transition-all hover:border-brand-purple hover:text-brand-purple disabled:cursor-not-allowed disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>

        <div className="max-h-[380px] overflow-y-auto rounded-2xl border border-gray-100 bg-white/80 p-3 space-y-3">
          {messages.map((message) => {
            const isUser = message.role === 'user';
            return (
              <div
                key={message.id}
                className={`flex items-start gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser ? (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-purple text-white">
                    <Bot size={15} />
                  </div>
                ) : null}

                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm font-semibold leading-6 whitespace-pre-line ${
                    isUser
                      ? 'bg-brand-purple text-white shadow-sm'
                      : 'bg-gray-50 text-gray-700 border border-gray-100'
                  }`}
                >
                  {message.content}
                </div>

                {isUser ? (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-orange text-white">
                    <User size={15} />
                  </div>
                ) : null}
              </div>
            );
          })}

          {isSending ? (
            <div className="flex items-start gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-purple text-white">
                <Loader2 size={15} className="animate-spin" />
              </div>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-500">
                Vidya AI is thinking about the scanned homework...
              </div>
            </div>
          ) : null}

          <div ref={listEndRef} />
        </div>

        {error ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
            {error}
          </div>
        ) : null}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submitMessage(input);
          }}
          className="space-y-3"
        >
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask about a step, the OCR text, or why the final answer works..."
            rows={3}
            disabled={isSending || !canChat}
            className="w-full resize-none rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 outline-none transition focus:border-brand-purple disabled:cursor-not-allowed disabled:bg-gray-50"
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-black text-gray-600 transition hover:border-brand-purple hover:text-brand-purple"
            >
              <RotateCcw size={14} />
              Reset chat
            </button>

            <Button
              type="submit"
              variant="blue"
              disabled={isSending || !input.trim() || !canChat}
              className="inline-flex min-w-[150px] items-center gap-2"
            >
              {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {isSending ? 'Thinking...' : 'Send'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ExplanationChatPanel;
