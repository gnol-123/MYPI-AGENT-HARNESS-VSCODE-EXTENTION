import { describe, it, expect, vi, beforeEach } from 'vitest';
import { webFetchTool } from '../../tools/web-fetch';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('web_fetch tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have name "web_fetch"', () => {
    expect(webFetchTool.name).toBe('web_fetch');
  });

  it('should fetch a URL and return content', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Map([['content-type', 'text/html']]),
      text: async () => '<html><body><p>Hello World</p></body></html>',
    });

    const result = await webFetchTool.execute({
      url: 'https://example.com',
      prompt: 'Summarize this page',
    });

    expect(result.content).toContain('Hello World');
    expect(result.content).toContain('Summarize this page');
    expect(result.error).toBeUndefined();
  });

  it('should return error for HTTP failures', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const result = await webFetchTool.execute({
      url: 'https://example.com/missing',
      prompt: 'test',
    });

    expect(result.error).toContain('404');
  });

  it('should handle JSON responses', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ name: 'test', version: '1.0' }),
    });

    const result = await webFetchTool.execute({
      url: 'https://api.example.com',
      prompt: 'Parse this',
    });

    expect(result.content).toContain('"name": "test"');
    expect(result.content).toContain('"version": "1.0"');
  });

  it('should return error for missing params', async () => {
    const result = await webFetchTool.execute({ url: '', prompt: '' });
    expect(result.error).toBeDefined();
  });
});
