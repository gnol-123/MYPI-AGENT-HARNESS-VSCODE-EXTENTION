import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ToolHandler, ToolResult } from './types';

const ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';
const MAX_RESULTS = 10;

/** Setting first (shippable), then env, then ~/.pi/agent — mirrors the context7 tool. */
function getApiKey(): string | undefined {
  if (process.env.BRAVE_SEARCH_API_KEY?.trim()) {
    return process.env.BRAVE_SEARCH_API_KEY.trim();
  }
  try {
    const p = path.join(os.homedir(), '.pi', 'agent', 'brave-key.txt');
    const key = fs.readFileSync(p, 'utf-8').trim();
    if (key) return key;
  } catch {
    // Not configured here.
  }
  return undefined;
}

interface BraveResult {
  title?: string;
  url?: string;
  description?: string;
}

export const webSearchTool: ToolHandler = {
  name: 'web_search',
  description:
    'Search the web and return ranked results with titles, URLs, and snippets. ' +
    'Use for current events, documentation, or anything after your knowledge cutoff. ' +
    'Returns snippets only — call web_fetch on a result URL to read the full page.',
  parameters: {
    type: 'object',
    required: ['query'],
    properties: {
      query: { type: 'string', description: 'The search query' },
      count: { type: 'number', description: `Number of results (1-${MAX_RESULTS}, default 5)` },
    },
  },

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const query = params.query as string;
    if (!query?.trim()) return { content: '', error: 'Missing required parameter: query' };

    const apiKey = getApiKey();
    if (!apiKey) {
      return {
        content: '',
        error:
          'No Brave Search API key. Set mypi-by-sl.braveSearchApiKey, the BRAVE_SEARCH_API_KEY env var, ' +
          'or create ~/.pi/agent/brave-key.txt. Free key (2k queries/month): https://brave.com/search/api/',
      };
    }

    const count = Math.min(Math.max(Number(params.count) || 5, 1), MAX_RESULTS);
    const url = `${ENDPOINT}?q=${encodeURIComponent(query.trim())}&count=${count}`;

    try {
      // The endpoint is a fixed constant, not model-controlled, so no SSRF surface.
      const response = await fetch(url, {
        headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
        signal: AbortSignal.timeout(15_000),
      });

      if (response.status === 401 || response.status === 403) {
        return { content: '', error: 'Brave Search rejected the API key (401/403). Check the key.' };
      }
      if (response.status === 429) {
        return { content: '', error: 'Brave Search rate limit reached. Wait a moment and retry.' };
      }
      if (!response.ok) {
        return { content: '', error: `Brave Search error: HTTP ${response.status}` };
      }

      const data = (await response.json()) as { web?: { results?: BraveResult[] } };
      const results = data.web?.results ?? [];
      if (results.length === 0) return { content: `No results for "${query}".` };

      const lines = results.slice(0, count).map((r, i) => {
        const desc = (r.description ?? '').replace(/<[^>]+>/g, '').trim();
        return `${i + 1}. ${r.title ?? '(untitled)'}\n   ${r.url ?? ''}\n   ${desc}`;
      });

      return {
        content:
          `Search results for "${query}":\n\n${lines.join('\n\n')}\n\n` +
          'These are snippets. Use web_fetch on a URL to read the full page.',
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('timeout') || msg.includes('abort')) {
        return { content: '', error: 'Brave Search timed out.' };
      }
      return { content: '', error: `Web search failed: ${msg}` };
    }
  },
};
