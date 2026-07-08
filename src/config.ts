import * as vscode from 'vscode';
import { SLSConfig, buildConfig } from './config-types';

function getVsCodeSettings(): Record<string, unknown> {
  const config = vscode.workspace.getConfiguration('sls-pi');
  return {
    'sls-pi.provider': config.get<string>('provider', 'anthropic'),
    'sls-pi.model': config.get<string>('model', 'claude-sonnet-4-20250514'),
    'sls-pi.apiEndpoint': config.get<string>('apiEndpoint', ''),
    'sls-pi.maxTokens': config.get<number>('maxTokens', 8192),
    'sls-pi.toolTimeout': config.get<number>('toolTimeout', 120),
    'sls-pi.skillsPath': config.get<string>('skillsPath', ''),
  };
}

export function getConfig(): SLSConfig {
  return buildConfig(getVsCodeSettings());
}

export async function getApiKey(secrets: vscode.SecretStorage): Promise<string | undefined> {
  return secrets.get('sls-pi.apiKey');
}

export async function setApiKey(secrets: vscode.SecretStorage, key: string): Promise<void> {
  await secrets.store('sls-pi.apiKey', key);
}

export { SLSConfig, buildConfig };
