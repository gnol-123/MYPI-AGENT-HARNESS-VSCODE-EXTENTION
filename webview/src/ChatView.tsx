import React, { useRef, useEffect, useState } from 'react';
import { Message, ToolCallEntry } from './types';

interface ChatViewProps {
  messages: Message[];
  streamingText: string;
  isLoading: boolean;
  waiting: boolean;
  thinking: boolean;
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
  streaming: {
    padding: '4px 0',
    fontSize: '12.5px',
    lineHeight: '1.55',
    color: 'var(--vscode-foreground)',
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
        <div className="mypi-tool-result">{tc.result || '(no output)'}</div>
      )}
    </div>
  );
};

export const ChatView: React.FC<ChatViewProps> = ({ messages, streamingText, isLoading, waiting, thinking }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, waiting]);

  return (
    <div style={styles.container}>
      {messages.length === 0 && !streamingText && (
        <div style={styles.emptyState}>
          <div style={styles.emptyLogo}>MYPI</div>
          <div style={styles.emptyText}>What can I do for you today?</div>
          <div style={styles.emptySubtext}>I can read, write, edit, run commands, and fetch docs.</div>
        </div>
      )}

      {messages.map((msg) => (
        <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
          {msg.role === 'user' ? (
            <div className="mypi-msg-user">
              {msg.content}
            </div>
          ) : (
            <div className="mypi-msg-assistant">
              <div className="mypi-role">MYPI</div>
              {msg.content}
            </div>
          )}
          {msg.toolCalls?.map((tc) => (
            <ToolCardComponent key={tc.id} tc={tc} />
          ))}
        </div>
      ))}

      {waiting && (
        <div style={styles.streaming}>
          <div className="mypi-role" style={{ color: '#cba6f7' }}>MYPI</div>
          <div className="mypi-typing">
            <span className="mypi-typing-dot" />
            <span className="mypi-typing-dot" />
            <span className="mypi-typing-dot" />
            <span className="mypi-typing-label">{thinking ? 'thinking' : 'queued'}</span>
          </div>
        </div>
      )}

      {streamingText && (
        <div style={styles.streaming}>
          <div className="mypi-role" style={{ color: '#cba6f7' }}>MYPI</div>
          {streamingText}
          {isLoading && (
            <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: 'var(--vscode-descriptionForeground)', marginLeft: '3px', animation: 'toolPulse 1s ease-in-out infinite' }} />
          )}
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
};
