import { describe, it, expect } from 'vitest';
import { providerForModel, allModels, PROVIDER_PRESETS } from '../config-types';
import { getApiKey, setApiKey, SecretsLike } from '../api-keys';

/**
 * Cross-provider model switching: picking a model routes to its provider
 * automatically, and each provider keeps its own API key.
 */

describe('providerForModel', () => {
  it('maps each preset model to its provider', () => {
    expect(providerForModel('claude-sonnet-5')).toBe('anthropic');
    expect(providerForModel('glm-4.6')).toBe('z-ai');
    expect(providerForModel('deepseek-v4-pro')).toBe('deepseek');
    expect(providerForModel('gpt-4o')).toBe('openai');
    expect(providerForModel('meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8')).toBe('together');
  });

  it('returns undefined for unknown models', () => {
    expect(providerForModel('not-a-model')).toBeUndefined();
  });
});

describe('allModels', () => {
  it('lists every model from every provider, without duplicates', () => {
    const models = allModels();
    for (const preset of Object.values(PROVIDER_PRESETS)) {
      for (const m of preset.models) expect(models).toContain(m);
    }
    expect(new Set(models).size).toBe(models.length);
  });
});

function fakeSecrets(initial: Record<string, string> = {}): SecretsLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    async get(key: string) { return data[key]; },
    async store(key: string, value: string) { data[key] = value; },
  };
}

describe('per-provider API keys', () => {
  it('stores and retrieves keys independently per provider', async () => {
    const secrets = fakeSecrets();
    await setApiKey(secrets, 'anthropic', 'sk-ant');
    await setApiKey(secrets, 'z-ai', 'zk-123');

    expect(await getApiKey(secrets, 'anthropic')).toBe('sk-ant');
    expect(await getApiKey(secrets, 'z-ai')).toBe('zk-123');
    expect(await getApiKey(secrets, 'openai')).toBeUndefined();
  });

  it('migrates the legacy single key to the provider it belonged to', async () => {
    // Before this feature there was one slot; it belonged to whatever provider
    // was configured in settings at the time.
    const secrets = fakeSecrets({ 'mypi-by-sl.apiKey': 'legacy-key' });

    expect(await getApiKey(secrets, 'z-ai', 'z-ai')).toBe('legacy-key');
    // Migrated into the per-provider slot, so it persists there.
    expect(secrets.data['mypi-by-sl.apiKey.z-ai']).toBe('legacy-key');
  });

  it('does not hand the legacy key to a different provider', async () => {
    const secrets = fakeSecrets({ 'mypi-by-sl.apiKey': 'legacy-key' });
    // An Anthropic key must never be sent to z.ai just because it exists.
    expect(await getApiKey(secrets, 'anthropic', 'z-ai')).toBeUndefined();
  });

  it('prefers the per-provider slot over the legacy key', async () => {
    const secrets = fakeSecrets({
      'mypi-by-sl.apiKey': 'legacy-key',
      'mypi-by-sl.apiKey.anthropic': 'per-provider-key',
    });
    expect(await getApiKey(secrets, 'anthropic', 'anthropic')).toBe('per-provider-key');
  });
});
