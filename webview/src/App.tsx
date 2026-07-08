/// <reference types="vscode-webview" />

import React, { useState, useEffect, useCallback } from 'react';
import { ChatView } from './ChatView';
import { InputBox } from './InputBox';
import { Message, HostToWebview, SessionInfo } from './types';

const vscodeApi = acquireVsCodeApi();

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  header: {
    padding: '6px 10px',
    borderBottom: '1px solid var(--vscode-sideBarSectionHeader-border)',
    fontSize: '13px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    color: 'var(--vscode-sideBarTitle-foreground)',
  },
  headerActions: {
    display: 'flex',
    gap: '4px',
  },
  headerBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--vscode-foreground)',
    cursor: 'pointer',
    padding: '2px 6px',
    borderRadius: '3px',
    fontSize: '14px',
    opacity: 0.7,
  },
  main: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  setupBanner: {
    margin: '12px',
    padding: '16px',
    borderRadius: '8px',
    background: 'var(--vscode-textBlockQuote-background)',
    border: '1px solid var(--vscode-textBlockQuote-border)',
    textAlign: 'center' as const,
  },
  setupTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--vscode-foreground)',
    marginBottom: '6px',
  },
  setupText: {
    fontSize: '12px',
    color: 'var(--vscode-descriptionForeground)',
    marginBottom: '12px',
    lineHeight: '1.5',
  },
  setupButton: {
    background: 'var(--vscode-button-background)',
    color: 'var(--vscode-button-foreground)',
    border: 'none',
    borderRadius: '4px',
    padding: '6px 16px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  tabsBar: {
    display: 'flex',
    gap: '2px',
    overflowX: 'auto' as const,
    padding: '4px 4px 0',
    borderBottom: '1px solid var(--vscode-sideBarSectionHeader-border)',
    scrollbarWidth: 'none' as any,
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 8px',
    borderRadius: '4px 4px 0 0',
    fontSize: '11px',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    maxWidth: '120px',
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    background: 'transparent',
    border: '1px solid transparent',
    borderBottom: 'none',
    color: 'var(--vscode-descriptionForeground)',
    position: 'relative' as const,
  },
  tabActive: {
    background: 'var(--vscode-tab-activeBackground)',
    color: 'var(--vscode-tab-activeForeground)',
    borderColor: 'var(--vscode-panel-border)',
  },
  tabClose: {
    opacity: 0,
    fontSize: '10px',
    lineHeight: '1',
    cursor: 'pointer',
    padding: '0 3px',
    borderRadius: '3px',
  },
  newTabBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--vscode-descriptionForeground)',
    cursor: 'pointer',
    padding: '3px 6px',
    fontSize: '14px',
    fontWeight: 600,
    borderRadius: '3px',
    lineHeight: 1,
  },
};

export const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentToolCalls, setCurrentToolCalls] = useState<Map<string, { name: string; params: Record<string, unknown> }>>(new Map());
  const [needsApiKey, setNeedsApiKey] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [activeSessionId, setActiveSessionId] = useState('');

  const sendMessage = useCallback((text: string) => {
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setStreamingText('');
    setIsLoading(true);
    setCurrentToolCalls(new Map());
    setNeedsApiKey(false);

    vscodeApi.postMessage({ type: 'userMessage', text });
  }, []);

  const openCommandPalette = useCallback(() => {
    vscodeApi.postMessage({ type: 'runCommand', command: 'mypi-by-sl.setApiKey' });
  }, []);

  const newSession = useCallback(() => {
    vscodeApi.postMessage({ type: 'newSession' });
  }, []);

  const switchSession = useCallback((sessionId: string) => {
    vscodeApi.postMessage({ type: 'switchSession', sessionId });
  }, []);

  const deleteSession = useCallback((sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    vscodeApi.postMessage({ type: 'deleteSession', sessionId });
  }, []);

  useEffect(() => {
    const handler = (event: MessageEvent<HostToWebview>) => {
      const msg = event.data;

      switch (msg.type) {
        case 'assistantStreamChunk':
          setStreamingText((prev) => prev + msg.text);
          break;

        case 'toolCallStart':
          setCurrentToolCalls((prev) => {
            const next = new Map(prev);
            next.set(msg.id, { name: msg.name, params: msg.params });
            return next;
          });
          break;

        case 'done': {
          const finalText = streamingText;
          const toolCalls = Array.from(currentToolCalls.entries()).map(([id, tc]) => ({
            id,
            name: tc.name,
            params: tc.params,
          }));

          setMessages((prev) => [
            ...prev,
            {
              id: msg.turnId,
              role: 'assistant',
              content: finalText,
              toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
              timestamp: Date.now(),
            },
          ]);
          setStreamingText('');
          setCurrentToolCalls(new Map());
          setIsLoading(false);
          break;
        }

        case 'error':
          if (msg.message.includes('API key') || msg.message.includes('Set API Key')) {
            setNeedsApiKey(true);
          }
          setStreamingText((prev) => prev + `\n\n${msg.message}`);
          setIsLoading(false);
          break;

        case 'sessionsList':
          setSessions(msg.sessions);
          setActiveSessionId(msg.activeId);
          break;

        case 'sessionMessages':
          setMessages(msg.messages);
          setStreamingText('');
          setIsLoading(false);
          setNeedsApiKey(false);
          break;

        case 'prefillPrompt': {
          const inputEl = document.querySelector('textarea');
          if (inputEl) {
            (inputEl as HTMLTextAreaElement).value = msg.text;
            (inputEl as HTMLTextAreaElement).focus();
          }
          break;
        }

        case 'userMessageEcho':
          break;
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [streamingText, currentToolCalls]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span>MYPI-by-SL</span>
        <div style={styles.headerActions}>
          <button style={styles.headerBtn} onClick={newSession} title="New session">+</button>
        </div>
      </div>
      {sessions.length > 0 && (
        <div style={styles.tabsBar}>
          {sessions.map((s) => (
            <div
              key={s.id}
              style={{
                ...styles.tab,
                ...(s.id === activeSessionId ? styles.tabActive : {}),
              }}
              onClick={() => switchSession(s.id)}
              title={s.name}
            >
              <span>{s.name}</span>
              {sessions.length > 1 && (
                <span
                  style={styles.tabClose}
                  className="tab-close-btn"
                  onClick={(e) => deleteSession(s.id, e)}
                >x</span>
              )}
            </div>
          ))}
          <button style={styles.newTabBtn} onClick={newSession} title="New session">+</button>
        </div>
      )}
      <style>{'.tab:hover .tab-close-btn { opacity: 0.6 !important; } .tab-close-btn:hover { opacity: 1 !important; color: #f38ba8 !important; }'}</style>
      <div style={styles.main}>
        {needsApiKey && messages.length === 0 && !streamingText && (
          <div style={styles.setupBanner}>
            <div style={styles.setupTitle}>Welcome to MYPI-by-SL</div>
            <div style={styles.setupText}>
              Set your API key to start using the AI coding agent.
            </div>
            <button style={styles.setupButton} onClick={openCommandPalette}>
              Set API Key
            </button>
          </div>
        )}
        <ChatView
          messages={messages}
          streamingText={streamingText}
          isLoading={isLoading}
        />
        <InputBox onSend={sendMessage} disabled={isLoading} />
      </div>
    </div>
  );
};
