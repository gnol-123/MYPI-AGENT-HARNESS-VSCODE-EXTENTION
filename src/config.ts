import * as vscode from 'vscode';
import { SLSConfig, buildConfig } from './config-types';

function getVsCodeSettings(): Record<string, unknown> {
  const config = vscode.workspace.getConfiguration('mypi-by-sl');
  return {
    'mypi-by-sl.provider': config.get<string>('provider', 'anthropic'),
    'mypi-by-sl.model': config.get<string>('model', 'claude-sonnet-4-20250514'),
    'mypi-by-sl.apiEndpoint': config.get<string>('apiEndpoint', ''),
    'mypi-by-sl.maxTokens': config.get<number>('maxTokens', 8192),
    'mypi-by-sl.toolTimeout': config.get<number>('toolTimeout', 120),
    'mypi-by-sl.skillsPath': config.get<string>('skillsPath', ''),
  };
}

export function getConfig(): SLSConfig {
  return buildConfig(getVsCodeSettings());
}

export async function getApiKey(secrets: vscode.SecretStorage): Promise<string | undefined> {
  return secrets.get('mypi-by-sl.apiKey');
}

export async function setApiKey(secrets: vscode.SecretStorage, key: string): Promise<void> {
  await secrets.store('mypi-by-sl.apiKey', key);
}

export { SLSConfig, buildConfig };
