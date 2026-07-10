import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import * as http from 'http';
import {
  browserNavigateTool,
  browserSnapshotTool,
  browserClickTool,
  setBrowserConsent,
  closeBrowser,
} from '../../tools/browser';
import { WebConsent, ConsentDecision } from '../../tools/web-consent';

/**
 * A headless browser executes JavaScript, so an un-gated one is a stronger
 * exfiltration primitive than web_fetch. Localhost is exempt on purpose: a dev
 * server is the main reason the tool exists. Everything else is gated.
 */

function grant(decision: ConsentDecision = 'domain') {
  const prompt = vi.fn(async () => decision);
  setBrowserConsent(new WebConsent({ allowed: [], blocked: [] }, prompt));
  return prompt;
}

let server: http.Server;
let baseUrl: string;

beforeEach(() => grant());

afterAll(async () => {
  await closeBrowser();
  server?.close();
});

describe('browser navigation guard', () => {
  it('blocks cloud metadata even though it is link-local', async () => {
    const prompt = grant();
    const r = await browserNavigateTool.execute({ url: 'http://169.254.169.254/latest/meta-data/' });
    expect(r.error).toMatch(/blocked/i);
    // Never even asked the user — refused outright.
    expect(prompt).not.toHaveBeenCalled();
  });

  it('blocks non-http schemes', async () => {
    const r = await browserNavigateTool.execute({ url: 'file:///etc/passwd' });
    expect(r.error).toMatch(/scheme/i);
  });

  it('rejects a missing url', async () => {
    const r = await browserNavigateTool.execute({});
    expect(r.error).toMatch(/missing/i);
  });

  it('does not navigate when the user denies the domain', async () => {
    grant('deny');
    const r = await browserNavigateTool.execute({ url: 'https://example.com' });
    expect(r.error).toMatch(/denied/i);
  });

  it('never prompts for localhost — a dev server needs no approval', async () => {
    const prompt = grant('deny'); // would deny if it asked
    const r = await browserNavigateTool.execute({ url: `${baseUrl}/` });
    expect(r.error).toBeUndefined();
    expect(prompt).not.toHaveBeenCalled();
  });
});

describe('browser tools drive a real page', () => {
  it('navigates, snapshots the a11y tree, and clicks by name', async () => {
    const nav = await browserNavigateTool.execute({ url: `${baseUrl}/` });
    expect(nav.error).toBeUndefined();
    expect(nav.content).toContain('HTTP 200');
    expect(nav.content).toContain('Test Page');

    const snap = await browserSnapshotTool.execute({});
    expect(snap.error).toBeUndefined();
    expect(snap.content).toContain('Hello Browser');
    expect(snap.content).toContain('Go to second page');
    // Page content must be framed as untrusted data.
    expect(snap.content).toContain('<untrusted_page_content');
    expect(snap.content).toMatch(/not instructions/i);

    const click = await browserClickTool.execute({ text: 'Go to second page' });
    expect(click.error).toBeUndefined();

    const after = await browserSnapshotTool.execute({});
    expect(after.content).toContain('Second Page Heading');
  }, 60_000);

  it('reports a helpful error when the element does not exist', async () => {
    await browserNavigateTool.execute({ url: `${baseUrl}/` });
    const r = await browserClickTool.execute({ text: 'No Such Button Anywhere' });
    expect(r.error).toMatch(/could not click/i);
    expect(r.error).toMatch(/browser_snapshot/);
  }, 60_000);
});

// Start the fixture server before the suite runs.
await new Promise<void>((resolve) => {
  server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    if (req.url?.startsWith('/second')) {
      res.end('<h1>Second Page Heading</h1>');
    } else {
      res.end('<title>Test Page</title><h1>Hello Browser</h1><a href="/second">Go to second page</a>');
    }
  });
  server.listen(0, '127.0.0.1', () => {
    baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
    resolve();
  });
});
