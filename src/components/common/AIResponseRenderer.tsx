import React, { useState, useEffect } from 'react';

// Block types for the parser
interface Block {
  type: 'heading' | 'list' | 'ordered-list' | 'code' | 'table' | 'blockquote' | 'paragraph';
  level?: number;
  items?: string[];
  content?: string;
  language?: string;
  headers?: string[];
  rows?: string[][];
}

interface AIResponseRendererProps {
  content: string;
  stream?: boolean;
  onStreamComplete?: () => void;
  speed?: number; // milliseconds per chunk
  loading?: boolean;
  className?: string;
}

// Tokenizes markdown text into structural blocks
export const parseMarkdown = (text: string): Block[] => {
  const lines = text.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 1. Code block
    if (line.trim().startsWith('```')) {
      const language = line.trim().slice(3).trim();
      let content = '';
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        content += lines[i] + '\n';
        i++;
      }
      blocks.push({ type: 'code', language, content: content.trim() });
      i++;
      continue;
    }

    // 2. Table
    if (line.trim().startsWith('|')) {
      const rows: string[][] = [];
      let headers: string[] = [];
      let isHeaderSeparator = false;

      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const currentLine = lines[i].trim();
        const parts = currentLine
          .split('|')
          .map((s) => s.trim())
          .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);

        const isSeparator = parts.every((part) => part.match(/^:?-+:?$/));
        if (isSeparator) {
          isHeaderSeparator = true;
        } else {
          if (headers.length === 0 && !isHeaderSeparator) {
            headers = parts;
          } else {
            rows.push(parts);
          }
        }
        i++;
      }

      if (headers.length > 0) {
        blocks.push({ type: 'table', headers, rows });
      } else if (rows.length > 0) {
        blocks.push({ type: 'table', headers: rows[0], rows: rows.slice(1) });
      }
      continue;
    }

    // 3. Blockquote
    if (line.trim().startsWith('>')) {
      let content = '';
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        content += lines[i].trim().slice(1).trim() + '\n';
        i++;
      }
      blocks.push({ type: 'blockquote', content: content.trim() });
      continue;
    }

    // 4. Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        content: headingMatch[2].trim(),
      });
      i++;
      continue;
    }

    // 5. Bullet list
    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      const items: string[] = [];
      while (
        i < lines.length &&
        (lines[i].trim().startsWith('- ') || lines[i].trim().startsWith('* '))
      ) {
        items.push(lines[i].trim().slice(2).trim());
        i++;
      }
      blocks.push({ type: 'list', items });
      continue;
    }

    // 6. Ordered list
    const orderedMatch = line.trim().match(/^(\d+)\.\s+(.*)$/);
    if (orderedMatch) {
      const items: string[] = [];
      while (i < lines.length && lines[i].trim().match(/^\d+\.\s+(.*)$/)) {
        const itemMatch = lines[i].trim().match(/^\d+\.\s+(.*)$/);
        if (itemMatch) {
          items.push(itemMatch[1].trim());
        }
        i++;
      }
      blocks.push({ type: 'ordered-list', items });
      continue;
    }

    // 7. Empty line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // 8. Paragraph
    let pContent = '';
    while (
      i < lines.length &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].trim().startsWith('|') &&
      !lines[i].trim().startsWith('>') &&
      !lines[i].match(/^(#{1,6})\s+/) &&
      !lines[i].trim().startsWith('- ') &&
      !lines[i].trim().startsWith('* ') &&
      !lines[i].trim().match(/^\d+\.\s+/) &&
      lines[i].trim() !== ''
    ) {
      pContent += lines[i] + ' ';
      i++;
    }
    if (pContent.trim()) {
      blocks.push({ type: 'paragraph', content: pContent.trim() });
    }
  }

  return blocks;
};

// Renders inline styles: bold, italic, inline code, and links
const renderInlineText = (text: string, hasCustomColor: boolean): React.ReactNode[] => {
  const regex = /(\*\*.*?\*\*|\*.*?\*|`.*?`|\[.*?\]\(.*?\))/g;
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className={`font-black ${hasCustomColor ? '' : 'text-brand-purple'}`}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return (
        <em key={index} className={`italic font-semibold ${hasCustomColor ? '' : 'text-gray-700'}`}>
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={index}
          className="px-1.5 py-0.5 bg-brand-purpleLight text-brand-purple border border-brand-purpleBorder/30 rounded-lg text-xs font-mono font-bold select-all mx-0.5"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    const linkMatch = part.match(/^\[(.*?)\]\((.*?)\)$/);
    if (linkMatch) {
      return (
        <a
          key={index}
          href={linkMatch[2]}
          target="_blank"
          rel="noreferrer"
          className="text-brand-blue hover:underline font-black"
        >
          {linkMatch[1]}
        </a>
      );
    }
    return part;
  });
};

export const ensureOcrStructuredMarkdown = (text: string): string => {
  if (!text) return '';
  const trimmed = text.trim();

  // Check if it already has the structured headers (specifically # Summary)
  if (/#\s*Summary/i.test(trimmed) || /##\s*Main Topic/i.test(trimmed)) {
    return trimmed;
  }

  // Split into paragraphs to construct structure
  const paragraphs = trimmed.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const title = paragraphs[0] ? paragraphs[0].slice(0, 100) : 'Scanned Homework Content';

  let mainTopic = title;
  let keyPoints = '';
  let importantConcepts = '';
  let detailedAnalysis = '';

  if (paragraphs.length === 1) {
    keyPoints = `- Crucial details and facts from the text.\n- Relevant concepts to help understand the question.`;
    importantConcepts = `- Key conceptual definitions in the homework.\n- Important points for exam preparation.`;
    detailedAnalysis = paragraphs[0];
  } else if (paragraphs.length >= 2) {
    mainTopic = paragraphs[0];
    keyPoints = paragraphs.slice(1, Math.min(3, paragraphs.length)).map(p => `- ${p}`).join('\n');
    importantConcepts = `- Essential topic: ${title}\n- Core ideas described in the homework.`;
    detailedAnalysis = paragraphs.slice(1).join('\n\n');
  }

  return `# Summary\nHere is a student-focused summary and breakdown of the homework topic to help you understand the concepts.\n\n## Main Topic\n${mainTopic}\n\n## Key Points\n${keyPoints || '- Important definitions and concepts discussed in the question.'}\n\n## Important Concepts\n${importantConcepts || '- Core foundations of this topic.'}\n\n## Detailed Analysis\n${detailedAnalysis}\n\n## Final Takeaways\nReview the step-by-step instructions below to master this topic.`;
};

export const AIResponseRenderer: React.FC<AIResponseRendererProps> = ({
  content,
  stream = false,
  onStreamComplete,
  speed = 30,
  loading = false,
  className = '',
}) => {
  const [displayedText, setDisplayedText] = useState(stream ? '' : content);
  const [isStreaming, setIsStreaming] = useState(stream);
  const [copiedTextMap, setCopiedTextMap] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!stream) {
      setDisplayedText(content);
      setIsStreaming(false);
      return;
    }

    setIsStreaming(true);
    let index = 0;
    // Split the text into tokens/words to make the streaming feel natural
    const tokens = content.split(/(\s+)/);
    setDisplayedText('');

    const interval = setInterval(() => {
      if (index >= tokens.length) {
        clearInterval(interval);
        setIsStreaming(false);
        if (onStreamComplete) {
          onStreamComplete();
        }
        return;
      }
      setDisplayedText((prev) => prev + tokens[index]);
      index++;
    }, speed);

    return () => {
      clearInterval(interval);
    };
  }, [content, stream, speed]);

  const handleCopy = (code: string, blockIdx: number) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedTextMap((prev) => ({ ...prev, [blockIdx]: true }));
      setTimeout(() => {
        setCopiedTextMap((prev) => ({ ...prev, [blockIdx]: false }));
      }, 1500);
    });
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2.5 py-3 select-none">
        <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 shadow-xs font-nunito text-xs text-gray-500 font-bold">
          <span className="w-2.5 h-2.5 bg-brand-purple rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2.5 h-2.5 bg-brand-purple rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2.5 h-2.5 bg-brand-purple rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          <span className="ml-1.5">Thinking...</span>
        </div>
      </div>
    );
  }

  const blocks = parseMarkdown(displayedText);
  const hasCustomColor = className.includes('text-');
  const blockAnimationClass = 'animate-[fadeIn_0.2s_ease-out]';

  return (
    <div className={`font-nunito space-y-4 ${hasCustomColor ? '' : 'text-gray-800'} ${className}`}>
      {blocks.map((block, idx) => {
        const isLastBlock = idx === blocks.length - 1;

        switch (block.type) {
          case 'heading': {
            const headingContent = (
              <>
                {renderInlineText(block.content || '', hasCustomColor)}
                {isLastBlock && isStreaming && (
                  <span className="inline-block w-2 h-4 bg-brand-purple ml-1.5 animate-pulse rounded-[1px] align-middle" />
                )}
              </>
            );

            if (block.level === 1) {
              return (
                <h1
                  key={idx}
                  className={`text-xl font-black leading-tight mb-3 mt-4 border-b border-gray-150 pb-1.5 font-poppins ${hasCustomColor ? '' : 'text-gray-800'} ${blockAnimationClass}`}
                >
                  {headingContent}
                </h1>
              );
            }
            if (block.level === 2) {
              return (
                <h2
                  key={idx}
                  className={`text-lg font-black leading-snug mb-2.5 mt-3.5 flex items-center gap-2 font-poppins ${hasCustomColor ? '' : 'text-gray-800'} ${blockAnimationClass}`}
                >
                  <span className="w-1.5 h-5 bg-brand-purple rounded-full inline-block shrink-0" />
                  {headingContent}
                </h2>
              );
            }
            return (
              <h3
                key={idx}
                className={`text-base font-extrabold leading-snug mb-2 mt-3 font-poppins ${hasCustomColor ? '' : 'text-gray-800'} ${blockAnimationClass}`}
              >
                {headingContent}
              </h3>
            );
          }

          case 'list':
            return (
              <ul key={idx} className={`list-none space-y-2 mb-4 pl-1 ${blockAnimationClass}`}>
                {block.items?.map((item, itemIdx) => {
                  const isLastItem = isLastBlock && itemIdx === (block.items?.length ?? 0) - 1;
                  return (
                    <li key={itemIdx} className={`text-sm font-semibold flex items-start gap-2.5 ${hasCustomColor ? '' : 'text-gray-700'}`}>
                      <span className="w-2.5 h-2.5 rounded-full bg-brand-orange mt-1.5 shrink-0 shadow-xs" />
                      <span className="leading-relaxed flex-1">
                        {renderInlineText(item, hasCustomColor)}
                        {isLastItem && isStreaming && (
                          <span className="inline-block w-2.5 h-4 bg-brand-purple ml-1.5 animate-pulse rounded-[1px] align-middle" />
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            );

          case 'ordered-list':
            return (
              <div key={idx} className={`space-y-3.5 mb-4 pl-0.5 ${blockAnimationClass}`}>
                {block.items?.map((item, itemIdx) => {
                  const isLastItem = isLastBlock && itemIdx === (block.items?.length ?? 0) - 1;
                  return (
                    <div
                      key={itemIdx}
                      className="bg-white rounded-2xl p-4 border border-gray-100 shadow-xs flex gap-3.5 items-start hover:border-gray-150 transition-colors"
                    >
                      <div className="w-7 h-7 rounded-full bg-brand-purple text-white text-xs font-black flex items-center justify-center shrink-0 select-none shadow-xs">
                        {itemIdx + 1}
                      </div>
                      <div className="font-nunito flex-1">
                        <div className={`text-sm font-semibold leading-relaxed ${hasCustomColor ? '' : 'text-gray-700'}`}>
                          {renderInlineText(item, hasCustomColor)}
                          {isLastItem && isStreaming && (
                            <span className="inline-block w-2.5 h-4 bg-brand-purple ml-1.5 animate-pulse rounded-[1px] align-middle" />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );

          case 'blockquote':
            return (
              <blockquote
                key={idx}
                className={`border-l-4 border-brand-purple bg-brand-purpleLight/40 pl-4 py-2.5 pr-2.5 rounded-r-2xl text-sm italic font-semibold mb-4 leading-relaxed ${hasCustomColor ? '' : 'text-gray-655'} ${blockAnimationClass}`}
              >
                {renderInlineText(block.content || '', hasCustomColor)}
                {isLastBlock && isStreaming && (
                  <span className="inline-block w-2.5 h-4 bg-brand-purple ml-1.5 animate-pulse rounded-[1px] align-middle" />
                )}
              </blockquote>
            );

          case 'code':
            return (
              <div
                key={idx}
                className={`relative group my-4 rounded-2xl overflow-hidden border border-gray-200 shadow-xs bg-gray-900 text-white font-mono text-xs ${blockAnimationClass}`}
              >
                <div className="bg-gray-800/80 px-4 py-2 flex items-center justify-between text-[10px] font-black uppercase text-gray-400 select-none border-b border-gray-800">
                  <span>{block.language || 'code'}</span>
                  <button
                    onClick={() => handleCopy(block.content || '', idx)}
                    className="px-2.5 py-1 rounded bg-gray-700 hover:bg-gray-650 hover:text-white transition active:scale-95 border-none cursor-pointer text-gray-300 font-bold"
                  >
                    {copiedTextMap[idx] ? 'Copied ✓' : 'Copy'}
                  </button>
                </div>
                <pre className="p-4 overflow-x-auto whitespace-pre leading-relaxed select-all">
                  <code>{block.content}</code>
                </pre>
                {isLastBlock && isStreaming && (
                  <span className="absolute bottom-2 right-2 inline-block w-2.5 h-4 bg-brand-purple animate-pulse rounded-[1px]" />
                )}
              </div>
            );

          case 'table':
            return (
              <div key={idx} className={`my-4 overflow-x-auto rounded-2xl border border-gray-150 shadow-xs ${blockAnimationClass}`}>
                <table className="w-full text-left border-collapse text-xs font-nunito">
                  <thead>
                    <tr className="bg-brand-purpleLight text-brand-purple border-b border-brand-purpleBorder/30">
                      {block.headers?.map((header, headerIdx) => (
                        <th key={headerIdx} className="p-3 font-black text-xs uppercase tracking-wider">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 bg-white">
                    {block.rows?.map((row, rowIdx) => (
                      <tr key={rowIdx} className="hover:bg-gray-50/50 transition">
                        {row.map((cell, cellIdx) => (
                          <td key={cellIdx} className={`p-3 font-semibold leading-relaxed ${hasCustomColor ? '' : 'text-gray-700'}`}>
                            {renderInlineText(cell, hasCustomColor)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {isLastBlock && isStreaming && (
                  <div className="bg-white p-2 text-right">
                    <span className="inline-block w-2.5 h-4 bg-brand-purple animate-pulse rounded-[1px] align-middle" />
                  </div>
                )}
              </div>
            );

          case 'paragraph':
          default:
            return (
              <p key={idx} className={`text-sm font-semibold leading-relaxed mb-4 ${hasCustomColor ? '' : 'text-gray-700'} ${blockAnimationClass}`}>
                {renderInlineText(block.content || '', hasCustomColor)}
                {isLastBlock && isStreaming && (
                  <span className="inline-block w-2.5 h-4 bg-brand-purple ml-1.5 animate-pulse rounded-[1px] align-middle" />
                )}
              </p>
            );
        }
      })}
    </div>
  );
};

export default AIResponseRenderer;
