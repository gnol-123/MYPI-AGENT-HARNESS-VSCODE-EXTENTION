import * as vscode from 'vscode';
import { SLSConfig, buildConfig, PROVIDER_PRESETS } from './config-types';
import type { Provider } from './config-types';

function getVsCodeSettings(): Record<string, unknown> {
  const config = vscode.workspace.getConfiguration('mypi-by-sl');
  return {
    'mypi-by-sl.provider': config.get<string>('provider', 'anthropic'),
    'mypi-by-sl.model': config.get<string>('model', ''),
    'mypi-by-sl.apiEndpoint': config.get<string>('apiEndpoint', ''),
    'mypi-by-sl.maxTokens': config.get<number>('maxTokens', 8192),
    'mypi-by-sl.toolTimeout': config.get<number>('toolTimeout', 120),
    'mypi-by-sl.skillsPath': config.get<string>('skillsPath', ''),
    'mypi-by-sl.thinkingLevel': config.get<string>('thinkingLevel', 'medium'),
  };
}

export function getConfig(): SLSConfig {
  return buildConfig(getVsCodeSettings());
}

// API keys live in ./api-keys.ts — one secret slot per provider.

export { SLSConfig, buildConfig, PROVIDER_PRESETS };
export type { Provider };
