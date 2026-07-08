import { ToolHandler, ToolResult } from './types';

export class ToolRegistry {
  private tools: Map<string, ToolHandler> = new Map();

  register(tool: ToolHandler): void {
    this.tools.set(tool.name, tool);
  }

  getTool(name: string): ToolHandler | undefined {
    return this.tools.get(name);
  }

  getAllToolDefs(): Array<{ name: string; description: string; input_schema: Record<string, unknown> }> {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }));
  }

  async execute(name: string, params: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    return tool.execute(params);
  }
}
