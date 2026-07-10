import type { Provider } from './config-types';

/** Minimal SecretStorage shape so tests can pass a plain object. */
export interface SecretsLike {
  get(key: string): Thenable<string | undefined>;
  store(key: string, value: string): Thenable<void>;
}

const LEGACY_SLOT = 'mypi-by-sl.apiKey';

function slotFor(provider: Provider): string {
  return `${LEGACY_SLOT}.${provider}`;
}

/**
 * Per-provider API key. `legacyOwner` is the provider configured in settings
 * back when there was a single key slot — the legacy key belongs to it and is
 * migrated on first read. It is never handed to any other provider: an
 * Anthropic key must not be sent to z.ai just because it exists.
 */
export async function getApiKey(
  secrets: SecretsLike,
  provider: Provider,
  legacyOwner?: Provider,
): Promise<string | undefined> {
  const key = await secrets.get(slotFor(provider));
  if (key) return key;

  if (legacyOwner === provider) {
    const legacy = await secrets.get(LEGACY_SLOT);
    if (legacy) {
      await secrets.store(slotFor(provider), legacy);
      return legacy;
    }
  }
  return undefined;
}

export async function setApiKey(secrets: SecretsLike, provider: Provider, key: string): Promise<void> {
  await secrets.store(slotFor(provider), key);
}
