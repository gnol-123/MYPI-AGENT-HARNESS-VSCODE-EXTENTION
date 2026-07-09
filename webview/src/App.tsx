/// <reference types="vscode-webview" />

import React, { useState, useEffect, useCallback } from 'react';
import { ChatView } from './ChatView';
import { InputBox } from './InputBox';
import { Message, HostToWebview, SessionInfo, SessionUsage, AgentDotState } from './types';

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
  const [thinkingSessions, setThinkingSessions] = useState<Set<string>>(new Set());
  const [thinkingBySession, setThinkingBySession] = useState<Map<string, string>>(new Map());
  const [usageBySession, setUsageBySession] = useState<Map<string, { usage: SessionUsage; contextPct: number }>>(new Map());
  const [showHelp, setShowHelp] = useState(false);
  const [agentStatus, setAgentStatus] = useState({ cwd: '', model: '', provider: '', tokenUsage: { inputTokens: 0, outputTokens: 0 }, availableModels: [] as string[] });

  // New state: status dot, queues, network errors
  const [dotStateBySession, setDotStateBySession] = useState<Map<string, AgentDotState>>(new Map());
  const [dotLabelBySession, setDotLabelBySession] = useState<Map<string, string>>(new Map());
  const [queuedBySession, setQueuedBySession] = useState<Map<string, string[]>>(new Map());
  const [networkErrorBySession, setNetworkErrorBySession] = useState<Map<string, string>>(new Map());
  const [thinkingEffort, setThinkingEffort] = useState<'low' | 'medium' | 'high'>('medium');
  const [runningSessions, setRunningSessions] = useState<Set<string>>(new Set());
  const [liveToolResultsBySession, setLiveToolResultsBySession] = useState<Map<string, Map<string, { result: string; truncated?: boolean; isError?: boolean }>>>(new Map());
  /** Ordered stream blocks for inline rendering (PI-style) */
  const [streamBlocksBySession, setStreamBlocksBySession] = useState<Map<string, import('./types').StreamBlock[]>>(new Map());

  const streamingText = streamingBySession.get(activeSessionId) ?? '';
  const isLoading = streamingBySession.has(activeSessionId);
  const isThinking = thinkingSessions.has(activeSessionId);
  const thinkingText = thinkingBySession.get(activeSessionId) ?? '';
  const activeUsage = usageBySession.get(activeSessionId);
  const dotState = dotStateBySession.get(activeSessionId) ?? 'idle';
  const dotLabel = dotLabelBySession.get(activeSessionId) ?? '';
  const isRunning = runningSessions.has(activeSessionId);
  const queuedTexts = queuedBySession.get(activeSessionId) ?? [];
  const networkError = networkErrorBySession.get(activeSessionId) ?? '';
  const liveToolResults = liveToolResultsBySession.get(activeSessionId);
  const streamBlocks = streamBlocksBySession.get(activeSessionId) ?? [];

  // Compute live tool calls for display during streaming
  const liveToolCalls = (() => {
    const calls = toolCallsBySession.get(activeSessionId);
    const results = liveToolResultsBySession.get(activeSessionId);
    if (!calls) return [];
    return Array.from(calls.entries()).map(([id, tc]) => ({
      id,
      name: tc.name,
      params: tc.params,
      result: results?.get(id)?.result,
      truncated: results?.get(id)?.truncated,
    }));
  })();

  const sendMessage = useCallback((text: string) => {
    // If session is already running, queue locally instead of adding to messages
    if (runningSessions.has(activeSessionId)) {
      setQueuedBySession((prev) => {
        const next = new Map(prev);
        const q = [...(next.get(activeSessionId) ?? [])];
        q.push(text);
        next.set(activeSessionId, q);
        return next;
      });
      vscodeApi.postMessage({ type: 'userMessage', text, sessionId: activeSessionId });
      return;
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setStreamingBySession((prev) => new Map(prev).set(activeSessionId, ''));
    setThinkingBySession((prev) => new Map(prev).set(activeSessionId, ''));
    setToolCallsBySession((prev) => new Map(prev).set(activeSessionId, new Map()));
    setLiveToolResultsBySession((prev) => {
      const next = new Map(prev);
      next.delete(activeSessionId);
      return next;
    });
    // Don't clear stream blocks here - keep previous run's thinking visible
    // until the new run produces output (first assistantStreamChunk clears them)
    setNeedsApiKey(false);
    setNetworkErrorBySession((prev) => {
      const next = new Map(prev);
      next.delete(activeSessionId);
      return next;
    });
    setRunningSessions((prev) => new Set(prev).add(activeSessionId));
    setDotStateBySession((prev) => new Map(prev).set(activeSessionId, 'working'));
    setDotLabelBySession((prev) => new Map(prev).set(activeSessionId, 'Starting...'));

    vscodeApi.postMessage({ type: 'userMessage', text, sessionId: activeSessionId });
  }, [activeSessionId, runningSessions]);

  const handleAbort = useCallback(() => {
    vscodeApi.postMessage({ type: 'cancelRequest', sessionId: activeSessionId });
    setRunningSessions((prev) => {
      const next = new Set(prev);
      next.delete(activeSessionId);
      return next;
    });
    setQueuedBySession((prev) => {
      const next = new Map(prev);
      next.delete(activeSessionId);
      return next;
    });
  }, [activeSessionId]);

  const handleCancelQueued = useCallback((index: number) => {
    setQueuedBySession((prev) => {
      const next = new Map(prev);
      const q = [...(next.get(activeSessionId) ?? [])];
      q.splice(index, 1);
      if (q.length === 0) next.delete(activeSessionId);
      else next.set(activeSessionId, q);
      return next;
    });
  }, [activeSessionId]);

  const handleRetry = useCallback((text: string) => {
    setNetworkErrorBySession((prev) => {
      const next = new Map(prev);
      next.delete(activeSessionId);
      return next;
    });
    setRunningSessions((prev) => new Set(prev).add(activeSessionId));
    setDotStateBySession((prev) => new Map(prev).set(activeSessionId, 'working'));
    vscodeApi.postMessage({ type: 'retryPrompt', sessionId: activeSessionId, text });
  }, [activeSessionId]);

  const handleThinkingEffort = useCallback((effort: 'low' | 'medium' | 'high') => {
    setThinkingEffort(effort);
    vscodeApi.postMessage({ type: 'setThinkingEffort', effort });
  }, []);

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
          setThinkingSessions((prev) => {
            if (!prev.has(msg.sessionId)) return prev;
            const next = new Set(prev);
            next.delete(msg.sessionId);
            return next;
          });
          setThinkingBySession((prev) => {
            const next = new Map(prev);
            next.delete(msg.sessionId);
            return next;
          });
          // Append to stream blocks for inline ordering
          setStreamBlocksBySession((prev) => {
            const next = new Map(prev);
            let blocks = next.get(msg.sessionId) ?? [];
            // If all existing blocks are completed (from a previous run), clear them for the new run
            if (blocks.length > 0 && blocks.every((b) => b.completed)) {
              blocks = [];
            }
            blocks = [...blocks];
            const last = blocks[blocks.length - 1];
            if (last && last.type === 'text' && !last.completed) {
              blocks[blocks.length - 1] = { ...last, text: (last.text ?? '') + msg.text };
            } else {
              blocks.push({ id: `t-${Date.now()}-${Math.random().toString(36).slice(2,5)}`, type: 'text', text: msg.text, completed: false });
            }
            next.set(msg.sessionId, blocks);
            return next;
          });
          break;

        case 'thinking':
          setThinkingSessions((prev) => {
            if (prev.has(msg.sessionId)) return prev;
            const next = new Set(prev);
            next.add(msg.sessionId);
            return next;
          });
          setThinkingBySession((prev) => {
            const next = new Map(prev);
            const existing = next.get(msg.sessionId) ?? '';
            next.set(msg.sessionId, existing + msg.text);
            return next;
          });
          // Append to stream blocks
          setStreamBlocksBySession((prev) => {
            const next = new Map(prev);
            const blocks = [...(next.get(msg.sessionId) ?? [])];
            const last = blocks[blocks.length - 1];
            if (last && last.type === 'thinking' && !last.completed) {
              blocks[blocks.length - 1] = { ...last, text: (last.text ?? '') + msg.text };
            } else {
              blocks.push({ id: `th-${Date.now()}-${Math.random().toString(36).slice(2,5)}`, type: 'thinking', text: msg.text, completed: false });
            }
            next.set(msg.sessionId, blocks);
            return next;
          });
          break;

        case 'sessionUsage':
          setUsageBySession((prev) => new Map(prev).set(msg.sessionId, { usage: msg.usage, contextPct: msg.contextPct }));
          break;

        case 'toolCallStart':
          setToolCallsBySession((prev) => {
            const next = new Map(prev);
            const inner = new Map(next.get(msg.sessionId) ?? []);
            inner.set(msg.id, { name: msg.name, params: msg.params });
            next.set(msg.sessionId, inner);
            return next;
          });
          // Add tool call as a stream block (inline with text)
          setStreamBlocksBySession((prev) => {
            const next = new Map(prev);
            const blocks = [...(next.get(msg.sessionId) ?? [])];
            blocks.push({
              id: msg.id,
              type: 'tool_call',
              toolName: msg.name,
              toolParams: msg.params,
              completed: false,
            });
            next.set(msg.sessionId, blocks);
            return next;
          });
          break;

        case 'done': {
          if (msg.sessionId === activeSessionId) {
            const finalText = streamingBySession.get(msg.sessionId) ?? '';
            const thinkText = thinkingBySession.get(msg.sessionId) ?? '';
            const inner = toolCallsBySession.get(msg.sessionId) ?? new Map();
            const toolCalls = Array.from(inner.entries()).map(([id, tc]) => ({
              id,
              name: tc.name,
              params: tc.params,
            }));
            // Build content with thinking preserved as blockquote
            const content = thinkText
              ? `> ${thinkText.replace(/\n/g, '\n> ')}\n\n${finalText}`
              : finalText;
            if (content || toolCalls.length > 0) {
              setMessages((prev) => [
                ...prev,
                {
                  id: msg.turnId,
                  role: 'assistant',
                  content,
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
          setLiveToolResultsBySession((prev) => {
            const next = new Map(prev);
            next.delete(msg.sessionId);
            return next;
          });
          setDotLabelBySession((prev) => {
            const next = new Map(prev);
            next.delete(msg.sessionId);
            return next;
          });
          setThinkingSessions((prev) => {
            const next = new Set(prev);
            next.delete(msg.sessionId);
            return next;
          });
          setThinkingBySession((prev) => {
            const next = new Map(prev);
            next.delete(msg.sessionId);
            return next;
          });
          setRunningSessions((prev) => {
            const next = new Set(prev);
            next.delete(msg.sessionId);
            return next;
          });
          // Don't clear stream blocks — keep thinking/tools visible after done
          break;
        }

        case 'statusDot':
          setDotStateBySession((prev) => new Map(prev).set(msg.sessionId, msg.state));
          if (msg.label) {
            setDotLabelBySession((prev) => new Map(prev).set(msg.sessionId, msg.label));
          }
          break;

        case 'toolCallResult':
          setLiveToolResultsBySession((prev) => {
            const next = new Map(prev);
            const inner = new Map(next.get(msg.sessionId) ?? []);
            inner.set(msg.id, { result: msg.result, truncated: msg.truncated, isError: msg.isError });
            next.set(msg.sessionId, inner);
            return next;
          });
          // Update the matching tool_call block with result
          setStreamBlocksBySession((prev) => {
            const next = new Map(prev);
            const blocks = [...(next.get(msg.sessionId) ?? [])];
            const idx = blocks.findIndex((b) => b.type === 'tool_call' && b.id === msg.id);
            if (idx >= 0) {
              blocks[idx] = {
                ...blocks[idx],
                toolResult: msg.result,
                toolTruncated: msg.truncated,
                toolIsError: msg.isError,
                completed: true,
              };
              next.set(msg.sessionId, blocks);
            }
            return next;
          });
          break;

        case 'abortConfirm':
          setRunningSessions((prev) => {
            const next = new Set(prev);
            next.delete(msg.sessionId);
            return next;
          });
          setDotStateBySession((prev) => new Map(prev).set(msg.sessionId, 'failed'));
          setDotLabelBySession((prev) => {
            const next = new Map(prev);
            next.delete(msg.sessionId);
            return next;
          });
          setToolCallsBySession((prev) => {
            const next = new Map(prev);
            next.delete(msg.sessionId);
            return next;
          });
          setLiveToolResultsBySession((prev) => {
            const next = new Map(prev);
            next.delete(msg.sessionId);
            return next;
          });
          setStreamBlocksBySession((prev) => {
            const next = new Map(prev);
            next.delete(msg.sessionId);
            return next;
          });
          break;

        case 'networkError':
          setNetworkErrorBySession((prev) => new Map(prev).set(msg.sessionId, msg.message));
          setRunningSessions((prev) => {
            const next = new Set(prev);
            next.delete(msg.sessionId);
            return next;
          });
          setDotStateBySession((prev) => new Map(prev).set(msg.sessionId, 'failed'));
          break;

        case 'networkReconnected':
          setNetworkErrorBySession((prev) => {
            const next = new Map(prev);
            next.delete(msg.sessionId);
            return next;
          });
          break;

        case 'queueStatus':
          setQueuedBySession((prev) => {
            const next = new Map(prev);
            if (msg.count > 0) {
              const existing = next.get(msg.sessionId) ?? [];
              // Trim to match backend count (backend is authoritative)
              if (existing.length > msg.count) {
                next.set(msg.sessionId, existing.slice(existing.length - msg.count));
              }
            } else {
              next.delete(msg.sessionId);
            }
            return next;
          });
          break;

        case 'thinkingEffort':
          setThinkingEffort(msg.effort);
          break;

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
          setUsageBySession((prev) => {
            const next = new Map(prev);
            for (const info of msg.sessions) {
              if (info.usage) {
                next.set(info.id, {
                  usage: info.usage,
                  contextPct: Math.min(100, (info.usage.lastContextTokens / 1_000_000) * 100),
                });
              }
            }
            return next;
          });
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

  // Tell backend we're ready to receive messages (fixes race condition on reload)
  useEffect(() => {
    vscodeApi.postMessage({ type: 'webviewReady' });
  }, []);

  const getDotColor = (state: AgentDotState): string => {
    switch (state) {
      case 'working': return '#f9e2af';
      case 'found': return '#a6e3a1';
      case 'done': return '#a6e3a1';
      case 'failed': return '#f38ba8';
      default: return '#6c7086';
    }
  };

  const getDotAnimation = (state: AgentDotState): string => {
    switch (state) {
      case 'working': return 'statusWorking 1.2s ease-in-out infinite';
      case 'found': return 'statusFound 0.35s ease-in-out infinite';
      case 'done':
      case 'failed':
      case 'idle':
      default: return 'none';
    }
  };

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes statusWorking { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
        @keyframes statusFound { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.15; transform: scale(0.6); } }
        .mypi-msg-user.active-bubble { outline: 1px solid rgba(137,180,250,0.4); outline-offset: 2px; position: relative; }
        .abort-btn { position: absolute; top: -8px; right: -8px; animation: fadeSlideIn 0.2s ease-out; }
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateX(4px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>
      <div style={styles.header}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>MYPI-by-SL</span>
          <span
            style={{
              width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0,
              background: getDotColor(dotState),
              animation: getDotAnimation(dotState),
              opacity: dotState === 'idle' ? 0.5 : 1,
            }}
            title={`Status: ${dotState}`}
          />
          {dotLabel && (
            <span style={{ fontSize: '10px', color: 'var(--vscode-descriptionForeground)', fontWeight: 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
              {dotLabel}
            </span>
          )}
        </span>
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
        {networkError && (
          <div style={{
            margin: '8px 12px', padding: '10px 12px',
            background: 'rgba(243,139,168,0.08)',
            border: '1px solid rgba(243,139,168,0.3)',
            borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px',
            fontSize: '11px', animation: 'shake 0.5s ease-out',
          }}>
            <span style={{ fontSize: '16px', flexShrink: 0 }}>⚠</span>
            <div style={{ flex: 1, minWidth: 0, lineHeight: '1.45' }}>
              <strong style={{ color: '#f38ba8', display: 'block', marginBottom: '1px' }}>Network disconnected</strong>
              <span style={{ color: 'var(--vscode-descriptionForeground)' }}>{networkError}</span>
            </div>
            <button
              style={{
                background: '#f38ba8', color: '#fff', border: 'none',
                borderRadius: '5px', padding: '4px 12px', fontSize: '11px',
                fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              }}
              onClick={() => handleRetry(messages[messages.length - 1]?.content ?? '')}
            >Retry</button>
          </div>
        )}

        <div style={{ padding: '3px 12px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px', borderBottom: '1px solid var(--vscode-sideBarSectionHeader-border)', color: 'var(--vscode-descriptionForeground)' }}>
          <span>Effort:</span>
          {(['low', 'medium', 'high'] as const).map((e) => (
            <button
              key={e}
              onClick={() => handleThinkingEffort(e)}
              style={{
                background: thinkingEffort === e ? 'var(--vscode-button-background)' : 'transparent',
                color: thinkingEffort === e ? 'var(--vscode-button-foreground)' : 'var(--vscode-descriptionForeground)',
                border: '1px solid var(--vscode-input-border)',
                borderRadius: '3px', padding: '1px 8px',
                fontSize: '10px', cursor: 'pointer', fontWeight: thinkingEffort === e ? 600 : 400,
              }}
            >{e}</button>
          ))}
        </div>

        <ChatView
          messages={messages}
          streamingText={streamingText}
          isLoading={isLoading}
          waiting={isLoading && !streamingText}
          thinking={isThinking}
          thinkingText={thinkingText}
          isRunning={isRunning}
          queuedCount={queuedTexts.length}
          queuedTexts={queuedTexts}
          liveToolCalls={liveToolCalls}
          streamBlocks={streamBlocks}
          onAbort={handleAbort}
          onCancelQueued={handleCancelQueued}
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
          disabled={false}
          isRunning={isRunning}
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
            <span style={styles.statusItem} title="Context used (of 1M tokens) · session cost">
              {activeUsage
                ? `${activeUsage.contextPct < 0.1 ? '<0.1' : activeUsage.contextPct.toFixed(1)}% of 1M · $${activeUsage.usage.costUsd.toFixed(4)}`
                : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
