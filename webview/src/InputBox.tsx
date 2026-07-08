import React, { useState, useRef, KeyboardEvent } from 'react';

interface InputBoxProps {
  onSend: (text: string) => void;
  disabled: boolean;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    padding: '8px',
    borderTop: '1px solid var(--vscode-sideBarSectionHeader-border)',
    gap: '6px',
  },
  input: {
    flex: 1,
    background: 'var(--vscode-input-background)',
    color: 'var(--vscode-input-foreground)',
    border: '1px solid var(--vscode-input-border)',
    borderRadius: '4px',
    padding: '6px 10px',
    fontSize: '13px',
    fontFamily: 'var(--vscode-font-family)',
    resize: 'none' as const,
    outline: 'none',
    maxHeight: '120px',
    minHeight: '32px',
  },
  sendButton: {
    background: 'var(--vscode-button-background)',
    color: 'var(--vscode-button-foreground)',
    border: 'none',
    borderRadius: '4px',
    padding: '6px 14px',
    fontSize: '13px',
    cursor: 'pointer',
    fontWeight: 500,
  },
  sendButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  hint: {
    textAlign: 'right' as const,
    fontSize: '10px',
    color: 'var(--vscode-descriptionForeground)',
    padding: '0 8px 4px',
  },
};

export const InputBox: React.FC<InputBoxProps> = ({ onSend, disabled }) => {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  return (
    <div>
      <div style={styles.container}>
        <textarea
          ref={textareaRef}
          style={styles.input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder="Ask anything..."
          disabled={disabled}
          rows={1}
        />
        <button
          style={{
            ...styles.sendButton,
            ...(disabled ? styles.sendButtonDisabled : {}),
          }}
          onClick={handleSend}
          disabled={disabled}
        >
          Send
        </button>
      </div>
      <div style={styles.hint}>Enter to send, Shift+Enter for newline</div>
    </div>
  );
};
