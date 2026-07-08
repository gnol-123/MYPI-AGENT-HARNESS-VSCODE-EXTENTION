export interface ToolResult {
  content: string;
  truncated?: boolean;
  error?: string;
}

export interface ToolHandler {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(params: Record<string, unknown>): Promise<ToolResult>;
}
