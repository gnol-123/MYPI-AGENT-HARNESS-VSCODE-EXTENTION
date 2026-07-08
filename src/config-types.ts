export interface SLSConfig {
  provider: 'anthropic' | 'openai-compatible';
  model: string;
  apiEndpoint: string;
  maxTokens: number;
  toolTimeout: number;
  skillsPath: string;
}

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
