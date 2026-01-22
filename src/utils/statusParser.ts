import type { UsageInfo } from '../types';
import { invoke } from '@tauri-apps/api/core';

/**
 * 解析 codex /status 命令的输出
 * 
 * 示例输出:
 * │  Account:          zq1156480@gmail.com (Team)                               │
 * │  Context window:   96% left (21.3K used / 258K)                             │
 * │  5h limit:         [████████████████████] 99% left (resets 14:14)           │
 * │  Weekly limit:     [█████████████████░░░] 87% left (resets 11:17 on 27 Jan) │
 */
export function parseStatusOutput(output: string): UsageInfo | null {
  try {
    // 移除ANSI转义序列
    const cleanOutput = output.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
    
    // 解析Context window
    const contextMatch = cleanOutput.match(
      /Context window:\s+(\d+)%\s+left\s+\(([^/]+)\/\s*([^)]+)\)/i
    );
    
    // 解析5h limit
    const fiveHourMatch = cleanOutput.match(
      /5h limit:.*?(\d+)%\s+left.*?resets\s+(\d+:\d+)/i
    );
    
    // 解析Weekly limit
    const weeklyMatch = cleanOutput.match(
      /Weekly limit:.*?(\d+)%\s+left.*?resets\s+([^)│]+)/i
    );
    
    if (!contextMatch && !fiveHourMatch && !weeklyMatch) {
      console.warn('Could not parse any usage info from output');
      return null;
    }
    
    return {
      contextWindow: {
        percentLeft: contextMatch ? parseInt(contextMatch[1], 10) : 0,
        used: contextMatch ? contextMatch[2].trim() : '0',
        total: contextMatch ? contextMatch[3].trim() : '0',
      },
      fiveHourLimit: {
        percentLeft: fiveHourMatch ? parseInt(fiveHourMatch[1], 10) : 0,
        resetTime: fiveHourMatch ? fiveHourMatch[2].trim() : '',
      },
      weeklyLimit: {
        percentLeft: weeklyMatch ? parseInt(weeklyMatch[1], 10) : 0,
        resetTime: weeklyMatch ? weeklyMatch[2].trim() : '',
      },
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Failed to parse status output:', error);
    return null;
  }
}

/**
 * 获取当前账号的用量信息
 * 注意：这需要先切换到对应账号
 */
export async function fetchCurrentUsage(): Promise<UsageInfo | null> {
  try {
    // 通过运行一个简短的codex交互来获取状态
    // 由于/status需要在交互模式下运行，我们使用一个workaround
    // 这里我们尝试读取并解析可能的状态输出
    const output = await invoke<string>('run_codex_command', { 
      args: ['--version'] 
    });
    
    // 如果只是版本信息，返回null
    // 实际的用量信息需要通过其他方式获取
    console.log('Codex output:', output);
    return null;
  } catch (error) {
    console.error('Failed to fetch usage:', error);
    return null;
  }
}

/**
 * 格式化百分比显示
 */
export function formatPercent(percent: number): string {
  return `${percent}%`;
}

/**
 * 获取用量状态的颜色
 */
export function getUsageColor(percentLeft: number): string {
  if (percentLeft >= 70) return 'text-green-400';
  if (percentLeft >= 40) return 'text-yellow-400';
  if (percentLeft >= 20) return 'text-orange-400';
  return 'text-red-400';
}

/**
 * 获取进度条颜色
 */
export function getProgressBarColor(percentLeft: number): string {
  if (percentLeft >= 70) return 'bg-green-500';
  if (percentLeft >= 40) return 'bg-yellow-500';
  if (percentLeft >= 20) return 'bg-orange-500';
  return 'bg-red-500';
}
