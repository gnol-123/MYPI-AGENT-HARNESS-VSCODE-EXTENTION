import React, { useRef, useEffect, useState, useMemo } from 'react';
import { marked } from 'marked';
import hljs from 'highlight.js';
import { Message, ToolCallEntry } from './types';

// marked renderer configured in renderMarkdown()

interface ChatViewProps {
  messages: Message[];
  streamingText: string;
  isLoading: boolean;
  waiting: boolean;
  thinking: boolean;
  thinkingText: string;
  isRunning: boolean;
  queuedCount: number;
  queuedTexts: string[];
  liveToolCalls?: ToolCallEntry[];
  streamBlocks?: import('./types').StreamBlock[];
  onAbort: () => void;
  onCancelQueued: (index: number) => void;
}

const COLORS: Record<string, string> = {
  read: '#89b4fa',
  write: '#a6e3a1',
  edit: '#f9e2af',
  bash: '#94e2d5',
  context7: '#cba6f7',
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  emptyState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    flexDirection: 'column' as const,
    gap: '12px',
    padding: '20px',
    textAlign: 'center' as const,
  },
  emptyLogo: {
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, #89b4fa, #cba6f7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: 800,
    color: '#fff',
    letterSpacing: '-0.5px',
  },
  emptyText: {
    color: 'var(--vscode-descriptionForeground)',
    fontSize: '13px',
    lineHeight: '1.5',
  },
  emptySubtext: {
    fontSize: '11px',
    color: 'var(--vscode-descriptionForeground)',
    opacity: 0.6,
  },
};

const ToolCardComponent: React.FC<{ tc: ToolCallEntry }> = ({ tc }) => {
  const [expanded, setExpanded] = useState(false);
  const color = COLORS[tc.name] ?? '#888';

  const paramsStr = Object.entries(tc.params)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v.slice(0, 40) : JSON.stringify(v).slice(0, 40)}`)
    .join(', ');

  return (
    <div className={`mypi-tool-card ${!tc.result ? 'executing' : ''}`}>
      <div className="mypi-tool-header" onClick={() => setExpanded(!expanded)}>
        <span className={`mypi-tool-dot ${tc.name}`} style={{ background: color, color }}></span>
        <span className={`mypi-tool-name ${tc.name}`} style={{ color }}>{tc.name}</span>
        <span className="mypi-tool-params">{paramsStr}</span>
        <span style={{ marginLeft: 'auto', fontSize: '9px', color: 'var(--vscode-descriptionForeground)' }}>
          {expanded ? '▼' : '▶'}
        </span>
      </div>
      {expanded && tc.result !== undefined && (
        <div className="mypi-tool-result" style={tc.isError ? { color: '#f38ba8' } : undefined}>{tc.result || '(no output)'}</div>
      )}
    </div>
  );
};

/** Render markdown to HTML, highlighting code blocks. */
function renderMarkdown(text: string): string {
  const renderer = new marked.Renderer();
  renderer.code = function({ text: code, lang }: { text: string; lang?: string }) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        const highlighted = hljs.highlight(code, { language: lang }).value;
        return `<pre><code class="hljs language-${lang}">${highlighted}</code></pre>`;
      } catch {}
    }
    const auto = hljs.highlightAuto(code).value;
    return `<pre><code class="hljs">${auto}</code></pre>`;
  };
  return marked.parse(text, { renderer, breaks: true, gfm: true }) as string;
}

export const ChatView: React.FC<ChatViewProps> = ({ messages, streamingText, isLoading, waiting, thinking, thinkingText, isRunning, queuedCount, queuedTexts, liveToolCalls, streamBlocks, onAbort, onCancelQueued }) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on any content change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, thinkingText, waiting, queuedCount, liveToolCalls, streamBlocks]);

  // Render streaming preview as markdown
  const streamingHtml = useMemo(() => {
    if (!streamingText) return '';
    return renderMarkdown(streamingText);
  }, [streamingText]);

  // Find the last user message - that's the "active" one during a run
  const lastUserMsgIndex = [...messages].reverse().findIndex((m) => m.role === 'user');

  return (
    <div style={styles.container} ref={containerRef}>
      {messages.length === 0 && !streamingText && (
        <div style={styles.emptyState}>
          <div style={styles.emptyLogo}>MYPI</div>
          <div style={styles.emptyText}>What can I do for you today?</div>
          <div style={styles.emptySubtext}>I can read, write, edit, run commands, and fetch docs.</div>
        </div>
      )}

      {messages.map((msg, idx) => {
        const isLastUser = msg.role === 'user' && lastUserMsgIndex === messages.length - 1 - idx;
        const showAbort = isLastUser && isRunning;

        return (
          <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
            {msg.role === 'user' ? (
              <div className={`mypi-msg-user${showAbort ? ' active-bubble' : ''}`}>
                {showAbort && (
                  <button
                    className="abort-btn"
                    title="Abort this prompt"
                    onClick={onAbort}
                    style={{
                      position: 'absolute',
                      top: '-8px',
                      right: '-8px',
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      background: 'var(--vscode-badge-background)',
                      border: '2px solid var(--vscode-sideBar-background)',
                      color: 'var(--vscode-foreground)',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      zIndex: 5,
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = '#f38ba8';
                      (e.currentTarget as HTMLElement).style.color = '#fff';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = 'var(--vscode-badge-background)';
                      (e.currentTarget as HTMLElement).style.color = 'var(--vscode-foreground)';
                    }}
                  >
                    &times;
                  </button>
                )}
                {msg.content}
              </div>
            ) : (
              <div className="mypi-msg-assistant">
                <div className="mypi-role">MYPI</div>
                <div
                  className="mypi-md-content"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                />
              </div>
            )}
            {msg.toolCalls?.map((tc) => (
              <ToolCardComponent key={tc.id} tc={tc} />
            ))}
          </div>
        );
      })}

      {/* Queued messages - show as pending bubbles */}
      {queuedTexts.map((qt, qi) => (
        <div key={`queued-${qi}`} style={{ alignSelf: 'flex-end', maxWidth: '85%', marginBottom: '8px' }}>
          <div style={{
            background: 'rgba(137,180,250,0.06)',
            border: '1px dashed rgba(137,180,250,0.25)',
            borderRadius: '10px 10px 2px 10px',
            padding: '8px 12px',
            fontSize: '12px',
            color: 'var(--vscode-descriptionForeground)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}>
            <span style={{ fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#89b4fa', whiteSpace: 'nowrap' }}>Queued #{qi + 1}</span>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{qt}</span>
            <button
              style={{
                width: '18px', height: '18px', borderRadius: '50%', background: 'transparent',
                border: 'none', color: 'var(--vscode-descriptionForeground)', cursor: 'pointer',
                fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
              title="Cancel queued message"
              onClick={() => onCancelQueued(qi)}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#f38ba8'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--vscode-descriptionForeground)'; }}
            >&times;</button>
          </div>
        </div>
      ))}

      {/* Waiting/thinking indicator */}
      {waiting && (
        <div className="mypi-streaming">
          <div className="mypi-role" style={{ color: '#cba6f7' }}>MYPI</div>
          <div style={{ fontSize: '12.5px', color: 'var(--vscode-descriptionForeground)', fontStyle: 'italic', padding: '4px 0' }}>
            {thinking ? 'thinking...' : isRunning ? 'starting...' : 'queued...'}
          </div>
          {thinking && thinkingText && (
            <div className="mypi-thinking-block">{thinkingText}</div>
          )}
        </div>
      )}

      {/* Unified stream blocks — renders text, thinking, and tool calls INLINE in arrival order */}
      {streamBlocks && streamBlocks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: '4px' }}>
          {streamBlocks.map((block, bi) => {
            if (block.type === 'tool_call') {
              return (
                <ToolCardComponent
                  key={block.id}
                  tc={{
                    id: block.id,
                    name: block.toolName ?? '',
                    params: block.toolParams ?? {},
                    result: block.toolResult,
                    truncated: block.toolTruncated,
                    isError: block.toolIsError,
                  }}
                />
              );
            }
            if (block.type === 'thinking') {
              return (
                <div key={block.id} className="mypi-thinking-block">
                  {block.text}
                </div>
              );
            }
            // text block
            const isLastTextBlock = bi === streamBlocks.length - 1 && block.type === 'text' && !block.completed;
            return (
              <div key={block.id}>
                <div className="mypi-role" style={{ color: '#cba6f7', marginBottom: '2px' }}>MYPI</div>
                <div
                  className="mypi-md-content"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(block.text ?? '') }}
                />
                {isLastTextBlock && isLoading && (
                  <span className="mypi-cursor-blink" />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Fallback: use old streaming text if no blocks yet */}
      {(!streamBlocks || streamBlocks.length === 0) && streamingText && (
        <div className="mypi-streaming">
          <div className="mypi-role" style={{ color: '#cba6f7' }}>MYPI</div>
          <div
            className="mypi-md-content"
            dangerouslySetInnerHTML={{ __html: streamingHtml }}
          />
          {isLoading && (
            <span className="mypi-cursor-blink" />
          )}
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
};
