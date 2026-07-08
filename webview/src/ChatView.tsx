import React, { useRef, useEffect } from 'react';
import { Message } from './types';
import { ToolCard } from './ToolCard';

interface ChatViewProps {
  messages: Message[];
  streamingText: string;
  isLoading: boolean;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px',
  },
  message: {
    marginBottom: '12px',
    padding: '6px 8px',
    borderRadius: '4px',
    maxWidth: '100%',
  },
  userMessage: {
    background: 'var(--vscode-textBlockQuote-background)',
  },
  assistantMessage: {
    background: 'transparent',
  },
  role: {
    fontSize: '11px',
    fontWeight: 600,
    marginBottom: '2px',
    color: 'var(--vscode-descriptionForeground)',
    textTransform: 'uppercase' as const,
  },
  content: {
    fontSize: '13px',
    lineHeight: '1.5',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  },
  streaming: {
    padding: '6px 8px',
    fontSize: '13px',
    lineHeight: '1.5',
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
  loadingDot: {
    display: 'inline-block',
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: 'var(--vscode-descriptionForeground)',
    marginLeft: '2px',
  },
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
          <div
            style={{
              ...styles.message,
              ...(msg.role === 'user' ? styles.userMessage : styles.assistantMessage),
            }}
          >
            <div style={styles.role}>{msg.role}</div>
            <div style={styles.content}>{msg.content}</div>
          </div>
          {msg.toolCalls?.map((tc) => (
            <ToolCard key={tc.id} id={tc.id} name={tc.name} params={tc.params} result={tc.result} />
          ))}
        </div>
      ))}

      {streamingText && (
        <div style={styles.streaming}>
          <div style={styles.role}>ASSISTANT</div>
          {streamingText}
          {isLoading && <span style={styles.loadingDot} />}
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
};
