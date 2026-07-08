export type Provider = 'anthropic' | 'openai' | 'deepseek' | 'z-ai' | 'together';

export interface SLSConfig {
  provider: Provider;
  model: string;
  apiEndpoint: string;
  maxTokens: number;
  toolTimeout: number;
  skillsPath: string;
}

export interface ProviderPreset {
  name: string;
  defaultModel: string;
  defaultEndpoint: string;
  needsApiKey: boolean;
}

export const PROVIDER_PRESETS: Record<Provider, ProviderPreset> = {
  anthropic: {
    name: 'Anthropic (Claude)',
    defaultModel: 'claude-sonnet-4-20250514',
    defaultEndpoint: '',
    needsApiKey: true,
  },
  openai: {
    name: 'OpenAI',
    defaultModel: 'gpt-4o',
    defaultEndpoint: 'https://api.openai.com/v1',
    needsApiKey: true,
  },
  deepseek: {
    name: 'DeepSeek',
    defaultModel: 'deepseek-chat',
    defaultEndpoint: 'https://api.deepseek.com/v1',
    needsApiKey: true,
  },
  'z-ai': {
    name: 'Z.AI',
    defaultModel: 'glm-4-flash',
    defaultEndpoint: 'https://api.z.ai/v1',
    needsApiKey: true,
  },
  together: {
    name: 'Together AI',
    defaultModel: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
    defaultEndpoint: 'https://api.together.xyz/v1',
    needsApiKey: true,
  },
};

const DEFAULT_CONFIG: SLSConfig = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  apiEndpoint: '',
  maxTokens: 8192,
  toolTimeout: 120,
  skillsPath: '',
};

export function buildConfig(raw: Record<string, unknown>): SLSConfig {
  return {
    provider: (raw['mypi-by-sl.provider'] as SLSConfig['provider']) ?? DEFAULT_CONFIG.provider,
    model: (raw['mypi-by-sl.model'] as string) ?? DEFAULT_CONFIG.model,
    apiEndpoint: (raw['mypi-by-sl.apiEndpoint'] as string) ?? DEFAULT_CONFIG.apiEndpoint,
    maxTokens: (raw['mypi-by-sl.maxTokens'] as number) ?? DEFAULT_CONFIG.maxTokens,
    toolTimeout: (raw['mypi-by-sl.toolTimeout'] as number) ?? DEFAULT_CONFIG.toolTimeout,
    skillsPath: (raw['mypi-by-sl.skillsPath'] as string) ?? DEFAULT_CONFIG.skillsPath,
  };
}
