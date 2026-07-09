// Standalone E2E test for Z.AI provider
// Usage: node test-zai.mjs <api-key>
import { createOpenAICompatProvider } from './out/providers/openai-compat.js';

const apiKey = process.argv[2] || process.env.ZAI_API_KEY;
if (!apiKey) {
  console.error('Usage: node test-zai.mjs <api-key>');
  console.error('   or: ZAI_API_KEY=sk-... node test-zai.mjs');
  process.exit(1);
}

const provider = createOpenAICompatProvider({
  apiKey,
  model: 'glm-4.6',
  baseUrl: 'https://api.z.ai/api/paas/v4',
  providerKey: 'z-ai',
  thinkingLevel: 'low',
  timeoutMs: 60000,
});

const tools = [
  { name: 'read', description: 'Read a file', input_schema: {
    type: 'object',
    properties: { path: { type: 'string' } },
    required: ['path'],
  }},
];

console.log('Testing Z.AI GLM-4.6 with thinking=low...\n');
const start = Date.now();

let textCount = 0, thinkCount = 0, errorCount = 0;
for await (const event of provider.streamChat(
  [{ role: 'user', content: 'Write a Python function that calculates fibonacci numbers. Just the code, no explanation.' }],
  tools,
  'You are a helpful coding assistant. Be concise.',
  4096,
)) {
  if (event.type === 'text') {
    textCount++;
    process.stdout.write(event.text);
  } else if (event.type === 'thinking') {
    thinkCount++;
    if (thinkCount === 1) console.log('\n--- THINKING ---');
    process.stdout.write(event.text);
  } else if (event.type === 'error') {
    errorCount++;
    console.log('\n--- ERROR ---');
    console.log(event.message);
  } else if (event.type === 'done') {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\n\nDone in ${elapsed}s. Text chunks: ${textCount}, Thinking chunks: ${thinkCount}, Errors: ${errorCount}`);
  }
}
