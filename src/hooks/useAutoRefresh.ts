import { useEffect, useRef, useCallback } from 'react';
import { useAccountStore } from '../stores/useAccountStore';
import { invoke } from '@tauri-apps/api/core';
import { switchToAccount as switchAccountUtil } from '../utils/storage';
import type { UsageInfo } from '../types';

/**
 * 自动刷新用量数据的Hook
 */
export function useAutoRefresh() {
  const { accounts, config, updateUsage, activeAccountId } = useAccountStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRefreshingRef = useRef(false);
  
  /**
   * 获取单个账号的用量信息
   * 需要先切换到该账号，然后执行codex命令
   */
  const fetchAccountUsage = useCallback(async (accountId: string): Promise<UsageInfo | null> => {
    try {
      // 切换到目标账号
      const account = accounts.find(a => a.id === accountId);
      if (!account) return null;
      
      // 写入auth.json（临时切换）
      await invoke('write_codex_auth', {
        authConfig: JSON.stringify(account.authConfig),
      });
      
      // 尝试运行codex并获取状态
      // 由于/status是交互式命令，我们这里使用一个模拟的方式
      // 实际实现可能需要用更复杂的方法
      
      // 模拟一些用量数据（实际应用中需要真正解析）
      // TODO: 实现真正的用量获取
      const mockUsage: UsageInfo = {
        contextWindow: {
          percentLeft: Math.floor(Math.random() * 30) + 70,
          used: '15.2K',
          total: '258K',
        },
        fiveHourLimit: {
          percentLeft: Math.floor(Math.random() * 40) + 60,
          resetTime: new Date(Date.now() + 3600000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        },
        weeklyLimit: {
          percentLeft: Math.floor(Math.random() * 50) + 50,
          resetTime: '周一 00:00',
        },
        lastUpdated: new Date().toISOString(),
      };
      
      return mockUsage;
    } catch (error) {
      console.error(`Failed to fetch usage for account ${accountId}:`, error);
      return null;
    }
  }, [accounts]);
  
  /**
   * 刷新所有账号的用量
   */
  const refreshAllUsage = useCallback(async () => {
    if (isRefreshingRef.current || accounts.length === 0) return;
    
    isRefreshingRef.current = true;
    const originalActiveId = activeAccountId;
    
    try {
      for (const account of accounts) {
        const usage = await fetchAccountUsage(account.id);
        if (usage) {
          await updateUsage(account.id, usage);
        }
        // 添加小延迟避免过快切换
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // 恢复原来的活动账号
      if (originalActiveId) {
        await switchAccountUtil(originalActiveId);
      }
    } finally {
      isRefreshingRef.current = false;
    }
  }, [accounts, activeAccountId, fetchAccountUsage, updateUsage]);
  
  /**
   * 刷新单个账号的用量
   */
  const refreshSingleAccount = useCallback(async (accountId: string) => {
    if (isRefreshingRef.current) return;
    
    isRefreshingRef.current = true;
    const originalActiveId = activeAccountId;
    
    try {
      const usage = await fetchAccountUsage(accountId);
      if (usage) {
        await updateUsage(accountId, usage);
      }
      
      // 如果不是当前账号，恢复原来的活动账号
      if (originalActiveId && originalActiveId !== accountId) {
        await switchAccountUtil(originalActiveId);
      }
    } finally {
      isRefreshingRef.current = false;
    }
  }, [activeAccountId, fetchAccountUsage, updateUsage]);
  
  // 设置自动刷新定时器
  useEffect(() => {
    if (config.autoRefreshInterval <= 0 || accounts.length === 0) {
      return;
    }
    
    // 清除旧的定时器
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    // 设置新的定时器（间隔以分钟为单位）
    const intervalMs = config.autoRefreshInterval * 60 * 1000;
    intervalRef.current = setInterval(() => {
      refreshAllUsage();
    }, intervalMs);
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [config.autoRefreshInterval, accounts.length, refreshAllUsage]);
  
  return {
    refreshAllUsage,
    refreshSingleAccount,
    isRefreshing: isRefreshingRef.current,
  };
}

export default useAutoRefresh;
