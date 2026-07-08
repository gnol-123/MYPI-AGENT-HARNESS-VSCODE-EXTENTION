import React, { useState } from 'react';

interface ToolCardProps {
  id: string;
  name: string;
  params: Record<string, unknown>;
  result?: string;
  truncated?: boolean;
}

const COLORS: Record<string, string> = {
  read: '#4a9eff',
  write: '#4ec94e',
  edit: '#e0c040',
  bash: '#888888',
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    margin: '4px 0 4px 16px',
    borderLeft: '3px solid var(--vscode-textBlockQuote-border)',
    paddingLeft: '8px',
    fontSize: '12px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    cursor: 'pointer',
    padding: '3px 0',
    userSelect: 'none' as const,
  },
  name: {
    fontWeight: 600,
    fontSize: '11px',
  },
  params: {
    color: 'var(--vscode-descriptionForeground)',
    fontSize: '11px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    maxWidth: '200px',
  },
  result: {
    marginTop: '2px',
    padding: '4px 6px',
    background: 'var(--vscode-textCodeBlock-background)',
    borderRadius: '3px',
    fontSize: '11px',
    fontFamily: 'var(--vscode-editor-font-family, monospace)',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-all' as const,
    maxHeight: '200px',
    overflowY: 'auto' as const,
  },
  arrow: {
    fontSize: '10px',
    color: 'var(--vscode-descriptionForeground)',
    transition: 'transform 0.15s',
  },
};

export const ToolCard: React.FC<ToolCardProps> = ({ name, params, result }) => {
  const [expanded, setExpanded] = useState(false);
  const color = COLORS[name] ?? '#888';

  const paramsStr = Object.entries(params)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v.slice(0, 40) : JSON.stringify(v).slice(0, 40)}`)
    .join(', ');

  return (
    <div style={styles.container}>
      <div style={styles.header} onClick={() => setExpanded(!expanded)}>
        <span style={styles.arrow}>{expanded ? 'v' : '>'}</span>
        <span style={{ ...styles.name, color }}>{name}</span>
        <span style={styles.params}>{paramsStr}</span>
      </div>
      {expanded && result !== undefined && (
        <div style={styles.result}>{result || '(no output)'}</div>
      )}
    </div>
  );
};
