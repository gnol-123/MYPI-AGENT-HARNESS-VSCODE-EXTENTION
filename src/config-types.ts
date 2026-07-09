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
  models: string[];
}

export const PROVIDER_PRESETS: Record<Provider, ProviderPreset> = {
  anthropic: {
    name: 'Anthropic (Claude)',
    defaultModel: 'claude-sonnet-4-20250514',
    defaultEndpoint: '',
    needsApiKey: true,
    models: [
      'claude-sonnet-4-20250514',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
    ],
  },
  openai: {
    name: 'OpenAI',
    defaultModel: 'gpt-4o',
    defaultEndpoint: 'https://api.openai.com/v1',
    needsApiKey: true,
    models: [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'o3-mini',
    ],
  },
  deepseek: {
    name: 'DeepSeek',
    defaultModel: 'deepseek-v4-pro',
    defaultEndpoint: 'https://api.deepseek.com/v1',
    needsApiKey: true,
    models: [
      'deepseek-v4-pro',
      'deepseek-v4-flash',
      'deepseek-reasoner',
    ],
  },
  'z-ai': {
    name: 'Z.AI',
    defaultModel: 'glm-4-flash',
    defaultEndpoint: 'https://api.z.ai/v1',
    needsApiKey: true,
    models: [
      'glm-4-flash',
      'glm-4-plus',
      'glm-4-air',
    ],
  },
  together: {
    name: 'Together AI',
    defaultModel: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
    defaultEndpoint: 'https://api.together.xyz/v1',
    needsApiKey: true,
    models: [
      'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
      'meta-llama/Llama-3.3-70B-Instruct-Turbo',
      'deepseek-ai/DeepSeek-V3',
      'Qwen/Qwen2.5-72B-Instruct-Turbo',
    ],
  },
};

const DEFAULT_CONFIG: SLSConfig = {
  provider: 'anthropic',
  model: '',
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
