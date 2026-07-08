/// <reference types="vscode-webview" />

import React, { useState, useEffect, useCallback } from 'react';
import { ChatView } from './ChatView';
import { InputBox } from './InputBox';
import { Message, HostToWebview } from './types';

const vscodeApi = acquireVsCodeApi();

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  header: {
    padding: '8px 12px',
    borderBottom: '1px solid var(--vscode-sideBarSectionHeader-border)',
    fontSize: '13px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    color: 'var(--vscode-sideBarTitle-foreground)',
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
};

export const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentToolCalls, setCurrentToolCalls] = useState<Map<string, { name: string; params: Record<string, unknown> }>>(new Map());
  const [needsApiKey, setNeedsApiKey] = useState(false);

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

    vscodeApi.postMessage({ type: 'userMessage', text });
  }, []);

  const openCommandPalette = useCallback(() => {
    vscodeApi.postMessage({ type: 'runCommand', command: 'mypi-by-sl.setApiKey' });
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
  }, [streamingText, currentToolCalls]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>MYPI-by-SL</div>
      <div style={styles.main}>
        {needsApiKey && messages.length === 0 && !streamingText && (
          <div style={styles.setupBanner}>
            <div style={styles.setupTitle}>Welcome to MYPI-by-SL</div>
            <div style={styles.setupText}>
              Set your Anthropic API key to start using the AI coding agent.
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
