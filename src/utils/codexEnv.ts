import { invoke } from '@tauri-apps/api/core';
import type { AppConfig } from '../types';

const PROXY_ENV_KEYS = new Set(['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY']);

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, '\n');
}

function buildProxyEnvContent(existingContent: string, config: Pick<AppConfig, 'proxyEnabled' | 'proxyUrl'>): string {
  const preservedLines = normalizeLineEndings(existingContent)
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line.length > 0;
      const [key] = trimmed.split('=', 1);
      return !PROXY_ENV_KEYS.has(key.trim());
    });

  const nextLines = preservedLines.filter((line, index, lines) => {
    if (line.trim().length > 0) {
      return true;
    }

    const previousNonEmpty = lines.slice(0, index).some((item) => item.trim().length > 0);
    const nextNonEmpty = lines.slice(index + 1).some((item) => item.trim().length > 0);
    return previousNonEmpty && nextNonEmpty;
  });

  if (config.proxyEnabled) {
    const proxyUrl = config.proxyUrl.trim();
    if (!proxyUrl) {
      throw new Error('\u5df2\u542f\u7528\u4ee3\u7406\uff0c\u4f46\u672a\u914d\u7f6e\u4ee3\u7406\u5730\u5740');
    }

    if (nextLines.length > 0 && nextLines[nextLines.length - 1].trim().length > 0) {
      nextLines.push('');
    }

    nextLines.push(`HTTP_PROXY=${proxyUrl}`);
    nextLines.push(`HTTPS_PROXY=${proxyUrl}`);
    nextLines.push(`ALL_PROXY=${proxyUrl}`);
  }

  const normalized = nextLines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
  return normalized ? `${normalized}\n` : '';
}

async function readExistingCodexEnv(envPath: string): Promise<string> {
  try {
    return await invoke<string>('read_file_content', { filePath: envPath });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes('cannot find') || message.toLowerCase().includes('not found')) {
      return '';
    }
    throw error;
  }
}

export async function syncCodexProxyEnv(
  config: Pick<AppConfig, 'proxyEnabled' | 'proxyUrl'>
): Promise<{ path: string; mode: 'written' | 'cleared' }> {
  const homeDir = await invoke<string>('get_home_dir');
  const envPath = `${homeDir}\\.codex\\.env`;
  const existingContent = await readExistingCodexEnv(envPath);
  const nextContent = buildProxyEnvContent(existingContent, config);

  await invoke('write_file_content', {
    filePath: envPath,
    content: nextContent,
  });

  return {
    path: envPath,
    mode: config.proxyEnabled ? 'written' : 'cleared',
  };
}
