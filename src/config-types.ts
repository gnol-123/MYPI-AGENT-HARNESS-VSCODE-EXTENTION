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
    provider: (raw['sls-pi.provider'] as SLSConfig['provider']) ?? DEFAULT_CONFIG.provider,
    model: (raw['sls-pi.model'] as string) ?? DEFAULT_CONFIG.model,
    apiEndpoint: (raw['sls-pi.apiEndpoint'] as string) ?? DEFAULT_CONFIG.apiEndpoint,
    maxTokens: (raw['sls-pi.maxTokens'] as number) ?? DEFAULT_CONFIG.maxTokens,
    toolTimeout: (raw['sls-pi.toolTimeout'] as number) ?? DEFAULT_CONFIG.toolTimeout,
    skillsPath: (raw['sls-pi.skillsPath'] as string) ?? DEFAULT_CONFIG.skillsPath,
  };
}
