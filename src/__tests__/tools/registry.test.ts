import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../../tools/registry';
import { ToolHandler } from '../../tools/types';

describe('ToolRegistry', () => {
  it('should register and retrieve a tool', () => {
    const registry = new ToolRegistry();
    const mockTool: ToolHandler = {
      name: 'test',
      description: 'A test tool',
      parameters: {},
      execute: async () => ({ content: 'ok' }),
    };

    registry.register(mockTool);
    expect(registry.getTool('test')).toBe(mockTool);
  });

  it('should return tool definitions for LLM', () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'read',
      description: 'Read a file',
      parameters: { type: 'object', properties: { path: { type: 'string' } } },
      execute: async () => ({ content: '' }),
    });

    const defs = registry.getAllToolDefs();
    expect(defs).toHaveLength(1);
    expect(defs[0].name).toBe('read');
    expect(defs[0].input_schema).toBeDefined();
  });

  it('should execute a tool by name', async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'echo',
      description: 'Echo',
      parameters: {},
      execute: async (params) => ({ content: `echo: ${params.text}` }),
    });

    const result = await registry.execute('echo', { text: 'hello' });
    expect(result.content).toBe('echo: hello');
  });

  it('should throw for unknown tool', async () => {
    const registry = new ToolRegistry();
    await expect(registry.execute('unknown', {})).rejects.toThrow('Tool not found');
  });
});
