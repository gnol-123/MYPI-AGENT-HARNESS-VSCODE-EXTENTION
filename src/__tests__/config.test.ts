import { describe, it, expect } from 'vitest';
import { buildConfig } from '../config-types';

describe('buildConfig', () => {
  it('should construct config from settings', () => {
    const settings = {
      'sls-pi.provider': 'anthropic',
      'sls-pi.model': 'claude-sonnet-4-20250514',
      'sls-pi.apiEndpoint': '',
      'sls-pi.maxTokens': 8192,
      'sls-pi.toolTimeout': 120,
      'sls-pi.skillsPath': '',
    };

    const config = buildConfig(settings);

    expect(config.provider).toBe('anthropic');
    expect(config.model).toBe('claude-sonnet-4-20250514');
    expect(config.maxTokens).toBe(8192);
    expect(config.toolTimeout).toBe(120);
  });

  it('should use defaults for missing settings', () => {
    const config = buildConfig({});
    expect(config.provider).toBe('anthropic');
    expect(config.maxTokens).toBe(8192);
    expect(config.model).toBe('claude-sonnet-4-20250514');
  });

  it('should handle openai-compatible provider', () => {
    const config = buildConfig({
      'sls-pi.provider': 'openai-compatible',
      'sls-pi.model': 'gpt-4',
      'sls-pi.apiEndpoint': 'https://custom.api/v1',
      'sls-pi.maxTokens': 4096,
      'sls-pi.toolTimeout': 60,
      'sls-pi.skillsPath': '/custom/skills',
    });

    expect(config.provider).toBe('openai-compatible');
    expect(config.model).toBe('gpt-4');
    expect(config.apiEndpoint).toBe('https://custom.api/v1');
    expect(config.maxTokens).toBe(4096);
    expect(config.toolTimeout).toBe(60);
    expect(config.skillsPath).toBe('/custom/skills');
  });
});
