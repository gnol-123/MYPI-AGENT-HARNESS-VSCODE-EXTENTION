import { describe, it, expect } from 'vitest';
import { buildConfig } from '../config-types';

describe('buildConfig', () => {
  it('should construct config from settings', () => {
    const settings = {
      'mypi-by-sl.provider': 'anthropic',
      'mypi-by-sl.model': 'claude-sonnet-4-20250514',
      'mypi-by-sl.apiEndpoint': '',
      'mypi-by-sl.maxTokens': 8192,
      'mypi-by-sl.toolTimeout': 120,
      'mypi-by-sl.skillsPath': '',
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
      'mypi-by-sl.provider': 'openai-compatible',
      'mypi-by-sl.model': 'gpt-4',
      'mypi-by-sl.apiEndpoint': 'https://custom.api/v1',
      'mypi-by-sl.maxTokens': 4096,
      'mypi-by-sl.toolTimeout': 60,
      'mypi-by-sl.skillsPath': '/custom/skills',
    });

    expect(config.provider).toBe('openai-compatible');
    expect(config.model).toBe('gpt-4');
    expect(config.apiEndpoint).toBe('https://custom.api/v1');
    expect(config.maxTokens).toBe(4096);
    expect(config.toolTimeout).toBe(60);
    expect(config.skillsPath).toBe('/custom/skills');
  });
});
