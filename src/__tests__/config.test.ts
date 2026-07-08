import { describe, it, expect } from 'vitest';
import { buildConfig, PROVIDER_PRESETS } from '../config-types';

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

  it('should handle openai provider', () => {
    const config = buildConfig({
      'mypi-by-sl.provider': 'openai',
      'mypi-by-sl.model': 'gpt-4o',
      'mypi-by-sl.apiEndpoint': 'https://custom.api/v1',
      'mypi-by-sl.maxTokens': 4096,
      'mypi-by-sl.toolTimeout': 60,
      'mypi-by-sl.skillsPath': '/custom/skills',
    });

    expect(config.provider).toBe('openai');
    expect(config.model).toBe('gpt-4o');
    expect(config.apiEndpoint).toBe('https://custom.api/v1');
    expect(config.maxTokens).toBe(4096);
    expect(config.toolTimeout).toBe(60);
    expect(config.skillsPath).toBe('/custom/skills');
  });

  it('should handle deepseek provider', () => {
    const config = buildConfig({ 'mypi-by-sl.provider': 'deepseek' });
    expect(config.provider).toBe('deepseek');
  });

  it('should handle z-ai provider', () => {
    const config = buildConfig({ 'mypi-by-sl.provider': 'z-ai' });
    expect(config.provider).toBe('z-ai');
  });

  it('should handle together provider', () => {
    const config = buildConfig({ 'mypi-by-sl.provider': 'together' });
    expect(config.provider).toBe('together');
  });
});

describe('PROVIDER_PRESETS', () => {
  it('should have presets for all 5 providers', () => {
    const providers = Object.keys(PROVIDER_PRESETS);
    expect(providers).toHaveLength(5);
    expect(providers).toContain('anthropic');
    expect(providers).toContain('openai');
    expect(providers).toContain('deepseek');
    expect(providers).toContain('z-ai');
    expect(providers).toContain('together');
  });

  it('should have default endpoints for OpenAI-compatible providers', () => {
    expect(PROVIDER_PRESETS.deepseek.defaultEndpoint).toBe('https://api.deepseek.com/v1');
    expect(PROVIDER_PRESETS['z-ai'].defaultEndpoint).toBe('https://api.z.ai/v1');
    expect(PROVIDER_PRESETS.together.defaultEndpoint).toBe('https://api.together.xyz/v1');
    expect(PROVIDER_PRESETS.openai.defaultEndpoint).toBe('https://api.openai.com/v1');
  });

  it('should have default models', () => {
    expect(PROVIDER_PRESETS.deepseek.defaultModel).toBe('deepseek-chat');
    expect(PROVIDER_PRESETS.anthropic.defaultModel).toBe('claude-sonnet-4-20250514');
  });
});
