import { ToolHandler, ToolResult } from './types';

export const webFetchTool: ToolHandler = {
  name: 'web_fetch',
  description: 'Fetches content from a URL and processes into markdown. Fetches content from a specified URL and processes using an AI model. Takes a URL and a prompt as input, fetches the URL content, and returns the model\'s response about the content.',
  parameters: {
    type: 'object',
    required: ['url', 'prompt'],
    properties: {
      url: { type: 'string', description: 'URL to fetch content from' },
      prompt: { type: 'string', description: 'Prompt to process the fetched content with' },
    },
  },

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const url = params.url as string;
    const prompt = params.prompt as string;

    if (!url) return { content: '', error: 'Missing required parameter: url' };
    if (!prompt) return { content: '', error: 'Missing required parameter: prompt' };

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'SLs-PI/1.0',
          'Accept': 'text/html,text/plain,*/*',
        },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        return { content: '', error: `HTTP ${response.status}: ${response.statusText}` };
      }

      const contentType = response.headers.get('content-type') || '';
      let text: string;

      if (contentType.includes('application/json')) {
        const json = await response.json();
        text = JSON.stringify(json, null, 2);
      } else {
        text = await response.text();
      }

      // Strip HTML tags if HTML
      if (contentType.includes('text/html')) {
        text = text
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\s+/g, ' ')
          .trim();
      }

      // Truncate large responses
      const MAX_LENGTH = 50000;
      if (text.length > MAX_LENGTH) {
        text = text.substring(0, MAX_LENGTH) + '\n\n[Content truncated at 50000 characters]';
      }

      return {
        content: `Content from ${url}:\n\n${text}\n\n---\nProcess this with prompt: ${prompt}`,
        truncated: text.length > MAX_LENGTH || undefined,
      };
    } catch (err) {
      return { content: '', error: err instanceof Error ? err.message : String(err) };
    }
  },
};
