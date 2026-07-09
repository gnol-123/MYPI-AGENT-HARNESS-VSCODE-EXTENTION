import React, { useRef, useEffect, useState } from 'react';
import { Message, ToolCallEntry } from './types';

interface ChatViewProps {
  messages: Message[];
  streamingText: string;
  isLoading: boolean;
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
    color: 'var(--vscode-descriptionForeground)',
    fontSize: '13px',
    textAlign: 'center' as const,
    padding: '20px',
    flexDirection: 'column' as const,
    gap: '8px',
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

export const ChatView: React.FC<ChatViewProps> = ({ messages, streamingText, isLoading }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  return (
    <div style={styles.container}>
      {messages.length === 0 && !streamingText && (
        <div style={styles.emptyState}>
          <div>Ask me anything about your codebase.</div>
          <div style={{ fontSize: '11px', opacity: 0.7 }}>I can read, write, edit, and run commands.</div>
        </div>
      )}

      {messages.map((msg) => (
        <div key={msg.id}>
          {msg.role === 'user' ? (
            <div className="mypi-msg-user">
              <div className="mypi-role">You</div>
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
