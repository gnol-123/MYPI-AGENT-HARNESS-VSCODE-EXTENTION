import React, { useState, useRef, useCallback, KeyboardEvent, useEffect } from 'react';

interface SlashCommand {
  command: string;
  label: string;
  description: string;
  prompt: string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { command: '/design', label: 'Design UI', description: 'Create or redesign UI with frontend design skill', prompt: 'Using frontend-design and lavish skills, design a UI for: ' },
  { command: '/fix', label: 'Fix Bug', description: 'Debug and fix an issue systematically', prompt: 'Using systematic-debugging skill, fix this bug: ' },
  { command: '/explain', label: 'Explain Code', description: 'Explain what this code does', prompt: 'Explain this code in detail: ' },
  { command: '/refactor', label: 'Refactor', description: 'Refactor code for better quality', prompt: 'Refactor this code following best practices: ' },
  { command: '/test', label: 'Write Tests', description: 'Write tests using TDD approach', prompt: 'Using test-driven-development, write tests for: ' },
  { command: '/review', label: 'Code Review', description: 'Review code for issues', prompt: 'Review this code and identify issues: ' },
  { command: '/docs', label: 'Fetch Docs', description: 'Get API docs via Context7', prompt: 'Using context7, fetch documentation for: ' },
  { command: '/plan', label: 'Create Plan', description: 'Write an implementation plan', prompt: 'Using brainstorming and writing-plans, create a plan for: ' },
  { command: '/agent', label: 'Agent Prompt', description: 'Full agent instructions mode', prompt: '' },
];

interface InputBoxProps {
  onSend: (text: string) => void;
  disabled: boolean;
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    position: 'relative' as const,
  },
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
  popup: {
    position: 'absolute' as const,
    bottom: '100%',
    left: '8px',
    right: '8px',
    marginBottom: '2px',
    background: 'var(--vscode-dropdown-background)',
    border: '1px solid var(--vscode-dropdown-border)',
    borderRadius: '6px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
    maxHeight: '240px',
    overflowY: 'auto' as const,
    zIndex: 1000,
  },
  popupHeader: {
    padding: '6px 10px',
    fontSize: '10px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: 'var(--vscode-descriptionForeground)',
    borderBottom: '1px solid var(--vscode-dropdown-border)',
  },
  popupItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 10px',
    cursor: 'pointer',
    fontSize: '12px',
    borderBottom: '1px solid color-mix(in srgb, var(--vscode-dropdown-border) 50%, transparent)',
  },
  popupItemActive: {
    background: 'var(--vscode-list-activeSelectionBackground)',
    color: 'var(--vscode-list-activeSelectionForeground)',
  },
  commandBadge: {
    background: 'var(--vscode-badge-background)',
    color: 'var(--vscode-badge-foreground)',
    padding: '1px 6px',
    borderRadius: '3px',
    fontSize: '10px',
    fontWeight: 600,
    fontFamily: 'var(--vscode-editor-font-family, monospace)',
    whiteSpace: 'nowrap' as const,
  },
  commandDesc: {
    color: 'var(--vscode-descriptionForeground)',
    fontSize: '11px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  slashIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 4px',
  },
};

export const InputBox: React.FC<InputBoxProps> = ({ onSend, disabled }) => {
  const [text, setText] = useState('');
  const [showCommands, setShowCommands] = useState(false);
  const [filteredCommands, setFilteredCommands] = useState<SlashCommand[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const getSlashQuery = useCallback((value: string): string | null => {
    const cursorPos = textareaRef.current?.selectionStart ?? value.length;
    const textBeforeCursor = value.substring(0, cursorPos);
    const slashMatch = textBeforeCursor.match(/\/(\S*)$/);
    return slashMatch ? slashMatch[1] : null;
  }, []);

  const filterCommands = useCallback((query: string) => {
    const q = query.toLowerCase();
    return SLASH_COMMANDS.filter(
      (c) => c.command.toLowerCase().includes(q) || c.label.toLowerCase().includes(q),
    );
  }, []);

  const insertCommand = useCallback((cmd: SlashCommand) => {
    const value = text;
    const cursorPos = textareaRef.current?.selectionStart ?? value.length;
    const textBeforeCursor = value.substring(0, cursorPos);
    const textAfterCursor = value.substring(cursorPos);
    const slashIndex = textBeforeCursor.lastIndexOf('/');
    const newBefore = textBeforeCursor.substring(0, slashIndex) + cmd.prompt;
    const newValue = newBefore + textAfterCursor;

    setText(newValue);
    setShowCommands(false);

    setTimeout(() => {
      if (textareaRef.current) {
        const newPos = newBefore.length;
        textareaRef.current.selectionStart = newPos;
        textareaRef.current.selectionEnd = newPos;
        textareaRef.current.focus();
      }
    }, 0);
  }, [text]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    setShowCommands(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);

    const query = getSlashQuery(value);
    if (query !== null) {
      const filtered = filterCommands(query);
      setFilteredCommands(filtered);
      setShowCommands(filtered.length > 0);
      setSelectedIndex(0);
    } else {
      setShowCommands(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showCommands) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filteredCommands.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        if (filteredCommands[selectedIndex]) {
          e.preventDefault();
          insertCommand(filteredCommands[selectedIndex]);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowCommands(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey && !showCommands) {
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

  useEffect(() => {
    if (selectedIndex >= 0 && popupRef.current) {
      const item = popupRef.current.children[selectedIndex + 1] as HTMLElement;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  return (
    <div style={styles.wrapper}>
      {showCommands && filteredCommands.length > 0 && (
        <div style={styles.popup} ref={popupRef}>
          <div style={styles.popupHeader}>Commands</div>
          {filteredCommands.map((cmd, i) => (
            <div
              key={cmd.command}
              style={{
                ...styles.popupItem,
                ...(i === selectedIndex ? styles.popupItemActive : {}),
              }}
              onClick={() => insertCommand(cmd)}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span style={styles.commandBadge}>{cmd.command}</span>
              <span style={styles.commandDesc}>{cmd.description}</span>
            </div>
          ))}
        </div>
      )}
      <div style={styles.container}>
        <textarea
          ref={textareaRef}
          style={styles.input}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder='Ask anything... (type / for commands)'
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
      <div style={styles.hint}>Enter to send · / for commands · Shift+Enter for newline</div>
    </div>
  );
};
