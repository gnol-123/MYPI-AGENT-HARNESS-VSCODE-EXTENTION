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
    position: 'relative' as const,
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
    maxWidth: '140px',
    minWidth: '48px',
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
  tabName: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
  },
  tabClose: {
    flexShrink: 0,
    opacity: 0.5,
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
    flexShrink: 0,
  },
  statusBar: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '2px 10px',
    fontSize: '10px',
    color: 'var(--vscode-descriptionForeground)',
    borderTop: '1px solid var(--vscode-sideBarSectionHeader-border)',
    gap: '8px',
  },
  statusItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  overlay: {
    position: 'absolute' as const,
    bottom: '52px',
    left: '8px',
    right: '8px',
    background: 'var(--vscode-dropdown-background)',
    border: '1px solid var(--vscode-dropdown-border)',
    borderRadius: '6px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
    maxHeight: '320px',
    overflowY: 'auto' as const,
    zIndex: 1000,
  },
  overlayHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 10px',
    fontSize: '10px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: 'var(--vscode-descriptionForeground)',
    borderBottom: '1px solid var(--vscode-dropdown-border)',
    position: 'sticky' as const,
    top: 0,
    background: 'var(--vscode-dropdown-background)',
  },
  overlayClose: {
    cursor: 'pointer',
    opacity: 0.7,
    padding: '0 2px',
  },
  historyItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '7px 10px',
    cursor: 'pointer',
    fontSize: '12px',
    borderBottom: '1px solid color-mix(in srgb, var(--vscode-dropdown-border) 50%, transparent)',
  },
  historyName: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  },
  historyMeta: {
    flexShrink: 0,
    fontSize: '10px',
    color: 'var(--vscode-descriptionForeground)',
  },
  helpSection: {
    padding: '8px 10px',
    borderBottom: '1px solid color-mix(in srgb, var(--vscode-dropdown-border) 50%, transparent)',
  },
  helpTitle: {
    fontSize: '10px',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    color: 'var(--mypi-accent, #cba6f7)',
    marginBottom: '6px',
  },
  helpRow: {
    display: 'flex',
    gap: '8px',
    fontSize: '11.5px',
    padding: '2px 0',
    alignItems: 'baseline',
  },
  helpBadge: {
    background: 'var(--vscode-badge-background)',
    color: 'var(--vscode-badge-foreground)',
    padding: '1px 6px',
    borderRadius: '3px',
    fontSize: '10px',
    fontWeight: 600,
    fontFamily: 'var(--vscode-editor-font-family, monospace)',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
    minWidth: '64px',
    textAlign: 'center' as const,
  },
  helpDesc: {
    color: 'var(--vscode-descriptionForeground)',
  },
};

const HELP_COMMANDS: Array<[string, string]> = [
  ['/new', 'Start a new chat session'],
  ['/resume', 'Browse and reopen past sessions'],
  ['/clear', 'Clear the current session'],
  ['/help', 'Show this help'],
  ['/model', 'Switch the AI model'],
  ['/cd', 'Set working directory for shell commands'],
  ['/fix', 'Debug and fix an issue systematically'],
  ['/explain', 'Explain what code does'],
  ['/refactor', 'Refactor code for better quality'],
  ['/test', 'Write tests using TDD'],
  ['/review', 'Review code for issues'],
  ['/docs', 'Fetch API docs via Context7'],
  ['/plan', 'Create an implementation plan'],
  ['/design', 'Design UI with frontend design skill'],
];

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingBySession, setStreamingBySession] = useState<Map<string, string>>(new Map());
  const [toolCallsBySession, setToolCallsBySession] = useState<Map<string, Map<string, { name: string; params: Record<string, unknown> }>>>(new Map());
  const [needsApiKey, setNeedsApiKey] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [activeSessionId, setActiveSessionId] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [agentStatus, setAgentStatus] = useState({ cwd: '', model: '', provider: '', tokenUsage: { inputTokens: 0, outputTokens: 0 }, availableModels: [] as string[] });

  const streamingText = streamingBySession.get(activeSessionId) ?? '';
  const isLoading = streamingBySession.has(activeSessionId);

  const sendMessage = useCallback((text: string) => {
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setStreamingBySession((prev) => new Map(prev).set(activeSessionId, ''));
    setToolCallsBySession((prev) => new Map(prev).set(activeSessionId, new Map()));
    setNeedsApiKey(false);

    vscodeApi.postMessage({ type: 'userMessage', text, sessionId: activeSessionId });
  }, [activeSessionId]);

  const openCommandPalette = useCallback(() => {
    vscodeApi.postMessage({ type: 'runCommand', command: 'mypi-by-sl.setApiKey' });
  }, []);

  const newSession = useCallback(() => {
    setShowHistory(false);
    setShowHelp(false);
    vscodeApi.postMessage({ type: 'newSession' });
  }, []);

  const switchSession = useCallback((sessionId: string) => {
    setShowHistory(false);
    vscodeApi.postMessage({ type: 'switchSession', sessionId });
  }, []);

  const switchModel = useCallback((model: string) => {
    vscodeApi.postMessage({ type: 'switchModel', model });
  }, []);

  const setCwd = useCallback((cwd: string) => {
    vscodeApi.postMessage({ type: 'setCwd', cwd });
  }, []);

  const clearSession = useCallback(() => {
    vscodeApi.postMessage({ type: 'clearSession', sessionId: activeSessionId });
  }, [activeSessionId]);

  const deleteSession = useCallback((sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    vscodeApi.postMessage({ type: 'deleteSession', sessionId });
  }, []);

  useEffect(() => {
    const handler = (event: MessageEvent<HostToWebview>) => {
      const msg = event.data;

      switch (msg.type) {
        case 'assistantStreamChunk':
          setStreamingBySession((prev) => {
            const next = new Map(prev);
            next.set(msg.sessionId, (next.get(msg.sessionId) ?? '') + msg.text);
            return next;
          });
          break;

        case 'toolCallStart':
          setToolCallsBySession((prev) => {
            const next = new Map(prev);
            const inner = new Map(next.get(msg.sessionId) ?? []);
            inner.set(msg.id, { name: msg.name, params: msg.params });
            next.set(msg.sessionId, inner);
            return next;
          });
          break;

        case 'done': {
          if (msg.sessionId === activeSessionId) {
            const finalText = streamingBySession.get(msg.sessionId) ?? '';
            const inner = toolCallsBySession.get(msg.sessionId) ?? new Map();
            const toolCalls = Array.from(inner.entries()).map(([id, tc]) => ({
              id,
              name: tc.name,
              params: tc.params,
            }));
            if (finalText || toolCalls.length > 0) {
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
            }
          }
          setStreamingBySession((prev) => {
            const next = new Map(prev);
            next.delete(msg.sessionId);
            return next;
          });
          setToolCallsBySession((prev) => {
            const next = new Map(prev);
            next.delete(msg.sessionId);
            return next;
          });
          break;
        }

        case 'error': {
          if (msg.message.includes('API key') || msg.message.includes('Set API Key')) {
            setNeedsApiKey(true);
          }
          const sid = msg.sessionId;
          if (sid && msg.retryable) {
            // Mid-run error: surface in that session's stream; 'done' follows and finalizes.
            setStreamingBySession((prev) => {
              const next = new Map(prev);
              next.set(sid, (next.get(sid) ?? '') + `\n\n${msg.message}`);
              return next;
            });
          } else if (sid) {
            // Terminal rejection (busy guard, missing key): no 'done' will follow.
            setStreamingBySession((prev) => {
              const next = new Map(prev);
              next.delete(sid);
              return next;
            });
          }
          break;
        }

        case 'sessionsList':
          setSessions(msg.sessions);
          setActiveSessionId(msg.activeId);
          break;

        case 'sessionMessages':
          setMessages(msg.messages);
          setNeedsApiKey(false);
          break;

        case 'agentStatus':
          setAgentStatus({
            cwd: msg.cwd,
            model: msg.model,
            provider: msg.provider,
            tokenUsage: msg.tokenUsage,
            availableModels: msg.availableModels ?? [],
          });
          break;

        case 'prefillPrompt': {
          const inputEl = document.querySelector('textarea');
          if (inputEl) {
            (inputEl as HTMLTextAreaElement).value = msg.text;
            (inputEl as HTMLTextAreaElement).focus();
          }
          break;
        }
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [activeSessionId, streamingBySession, toolCallsBySession]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowHistory(false);
        setShowHelp(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span>MYPI-by-SL</span>
        <div style={styles.headerActions}>
          <button style={styles.headerBtn} onClick={() => { setShowHelp(false); setShowHistory((v) => !v); }} title="Session history (/resume)">⟲</button>
          <button style={styles.headerBtn} onClick={newSession} title="New session (/new)">+</button>
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
              <span style={styles.tabName}>{s.name}</span>
              {sessions.length > 1 && (
                <span
                  style={styles.tabClose}
                  className="tab-close-btn"
                  onClick={(e) => deleteSession(s.id, e)}
                >✕</span>
              )}
            </div>
          ))}
          <button style={styles.newTabBtn} onClick={newSession} title="New session">+</button>
        </div>
      )}
      <style>{'.tab-close-btn:hover { opacity: 1 !important; color: #f38ba8 !important; }'}</style>
      <div style={styles.main}>
        {needsApiKey && messages.length === 0 && !streamingText && (
          <div className="mypi-welcome" style={styles.setupBanner}>
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

        {showHistory && (
          <div className="mypi-slash-popup" style={styles.overlay}>
            <div style={styles.overlayHeader}>
              <span>Recent chats</span>
              <span style={styles.overlayClose} onClick={() => setShowHistory(false)}>✕</span>
            </div>
            {sessions.map((s) => (
              <div
                key={s.id}
                style={{
                  ...styles.historyItem,
                  ...(s.id === activeSessionId ? { background: 'var(--vscode-list-activeSelectionBackground)', color: 'var(--vscode-list-activeSelectionForeground)' } : {}),
                }}
                onClick={() => switchSession(s.id)}
              >
                <span style={styles.historyName}>{s.name}</span>
                <span style={styles.historyMeta}>{s.messageCount} msg · {relativeTime(s.updatedAt ?? s.createdAt)}</span>
              </div>
            ))}
          </div>
        )}

        {showHelp && (
          <div className="mypi-slash-popup" style={styles.overlay}>
            <div style={styles.overlayHeader}>
              <span>MYPI Help</span>
              <span style={styles.overlayClose} onClick={() => setShowHelp(false)}>✕</span>
            </div>
            <div style={styles.helpSection}>
              <div style={styles.helpTitle}>Commands</div>
              {HELP_COMMANDS.map(([cmd, desc]) => (
                <div key={cmd} style={styles.helpRow}>
                  <span style={styles.helpBadge}>{cmd}</span>
                  <span style={styles.helpDesc}>{desc}</span>
                </div>
              ))}
            </div>
            <div style={styles.helpSection}>
              <div style={styles.helpTitle}>Keybindings</div>
              <div style={styles.helpRow}><span style={styles.helpBadge}>Enter</span><span style={styles.helpDesc}>Send message</span></div>
              <div style={styles.helpRow}><span style={styles.helpBadge}>Shift+Enter</span><span style={styles.helpDesc}>New line</span></div>
              <div style={styles.helpRow}><span style={styles.helpBadge}>Esc</span><span style={styles.helpDesc}>Close popups</span></div>
            </div>
            <div style={styles.helpSection}>
              <div style={styles.helpTitle}>Status</div>
              <div style={styles.helpRow}><span style={styles.helpBadge}>Model</span><span style={styles.helpDesc}>{agentStatus.model || 'not connected'}</span></div>
              <div style={styles.helpRow}><span style={styles.helpBadge}>Provider</span><span style={styles.helpDesc}>{agentStatus.provider || 'not connected'}</span></div>
              <div style={styles.helpRow}><span style={styles.helpBadge}>CWD</span><span style={styles.helpDesc}>{agentStatus.cwd || '—'}</span></div>
              <div style={styles.helpRow}><span style={styles.helpBadge}>Tokens</span><span style={styles.helpDesc}>{(agentStatus.tokenUsage.inputTokens + agentStatus.tokenUsage.outputTokens).toLocaleString()}</span></div>
            </div>
            <div style={{ ...styles.helpSection, borderBottom: 'none', textAlign: 'center' as const }}>
              <button style={styles.setupButton} onClick={openCommandPalette}>Set API Key</button>
            </div>
          </div>
        )}

        <InputBox
          onSend={sendMessage}
          disabled={isLoading}
          availableModels={agentStatus.availableModels}
          currentModel={agentStatus.model}
          onSwitchModel={switchModel}
          onSetCwd={setCwd}
          onNewSession={newSession}
          onShowHistory={() => { setShowHelp(false); setShowHistory(true); }}
          onClearSession={clearSession}
          onShowHelp={() => { setShowHistory(false); setShowHelp(true); }}
        />
        {agentStatus.provider && (
          <div style={styles.statusBar}>
            <span style={styles.statusItem} title={agentStatus.cwd}>
              <span className="mypi-status-dot"></span>
              {agentStatus.cwd}
            </span>
            <span style={styles.statusItem}>{agentStatus.provider} · {agentStatus.model}</span>
            <span style={styles.statusItem}>
              {agentStatus.tokenUsage.inputTokens + agentStatus.tokenUsage.outputTokens > 0
                ? `Tokens: ${(agentStatus.tokenUsage.inputTokens + agentStatus.tokenUsage.outputTokens).toLocaleString()}`
                : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
