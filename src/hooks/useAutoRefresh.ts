import { useEffect, useRef, useCallback } from 'react';
import { useAccountStore } from '../stores/useAccountStore';
import { invoke } from '@tauri-apps/api/core';
import { switchToAccount as switchAccountUtil, getCurrentAuthAccountId } from '../utils/storage';
import type { UsageInfo } from '../types';

/**
 * Rust 后端返回的用量数据结构
 */
interface RustUsageData {
  five_hour_percent_left: number;
  five_hour_reset_time: string;
  weekly_percent_left: number;
  weekly_reset_time: string;
  last_updated: string;
}

/**
 * 自动刷新用量数据的Hook
 */
export function useAutoRefresh() {
  const { accounts, config, updateUsage, activeAccountId, syncCurrentAccount } = useAccountStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const authCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRefreshingRef = useRef(false);
  const autoRefreshAccountIdRef = useRef<string | null>(null);
  
  /**
   * 获取单个账号的用量信息
   * 通过解析本地 ~/.codex/sessions 日志文件获取真实数据
   * 
   * 重要逻辑：
   * - 活动账号：可以使用最新 session 的数据（因为它就是用活动账号创建的）
   * - 非活动账号：只能使用该账号自己的历史数据，不能混用其他账号的数据
   */
  const fetchAccountUsage = useCallback(async (accountId: string): Promise<UsageInfo | null> => {
    try {
      // 找到账号信息
      const account = accounts.find(a => a.id === accountId);
      if (!account) return null;
      
      const isActiveAccount = accountId === activeAccountId;
      
      // 先尝试通过邮箱查找该账号特定的用量数据
      try {
        const usageData = await invoke<RustUsageData>('get_account_usage', {
          accountEmail: account.accountInfo.email,
        });
        
        return {
          contextWindow: {
            percentLeft: 100, // 从日志中暂时无法获取，设为默认值
            used: '0K',
            total: '258K',
          },
          fiveHourLimit: {
            percentLeft: Math.round(usageData.five_hour_percent_left),
            resetTime: usageData.five_hour_reset_time,
          },
          weeklyLimit: {
            percentLeft: Math.round(usageData.weekly_percent_left),
            resetTime: usageData.weekly_reset_time,
          },
          lastUpdated: new Date().toISOString(),
        };
      } catch (accountError) {
        console.warn(`No specific data for ${account.accountInfo.email}`);
        
        // 只有活动账号才可以使用最新 session 的数据
        // 因为最新 session 一定是用活动账号创建的
        if (isActiveAccount) {
          try {
            const usageData = await invoke<RustUsageData>('get_usage_from_sessions');
            
            return {
              contextWindow: {
                percentLeft: 100,
                used: '0K',
                total: '258K',
              },
              fiveHourLimit: {
                percentLeft: Math.round(usageData.five_hour_percent_left),
                resetTime: usageData.five_hour_reset_time,
              },
              weeklyLimit: {
                percentLeft: Math.round(usageData.weekly_percent_left),
                resetTime: usageData.weekly_reset_time,
              },
              lastUpdated: new Date().toISOString(),
            };
          } catch (sessionError) {
            console.warn('No session data available for active account:', sessionError);
            return null;
          }
        } else {
          // 非活动账号：如果找不到该账号的历史数据，返回 null
          // 不要使用其他账号的数据，避免数据混淆
          console.warn(`Account ${account.accountInfo.email} has no usage history. Need to use codex with this account first.`);
          return null;
        }
      }
    } catch (error) {
      console.error(`Failed to fetch usage for account ${accountId}:`, error);
      return null;
    }
  }, [accounts, activeAccountId]);
  
  /**
   * 刷新所有账号的用量
   */
  const refreshAllUsage = useCallback(async () => {
    if (isRefreshingRef.current || accounts.length === 0) return;
    
    isRefreshingRef.current = true;
    
    // 检查当前是否有登录账号（auth.json 是否存在）
    const currentAuthId = await getCurrentAuthAccountId();
    
    try {
      for (const account of accounts) {
        const usage = await fetchAccountUsage(account.id);
        if (usage) {
          await updateUsage(account.id, usage);
        }
        // 添加小延迟避免过快切换
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // 只有当刷新前确实有登录账号时，才恢复原来的活动账号
      // 如果 auth.json 不存在（用户已退出登录），不要自动创建
      if (currentAuthId && activeAccountId) {
        await switchAccountUtil(activeAccountId);
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
    
    // 检查当前是否有登录账号（auth.json 是否存在）
    const currentAuthId = await getCurrentAuthAccountId();
    
    try {
      const usage = await fetchAccountUsage(accountId);
      if (usage) {
        await updateUsage(accountId, usage);
      }
      
      // 只有当刷新前确实有登录账号时，才恢复原来的活动账号
      // 如果 auth.json 不存在（用户已退出登录），不要自动创建
      if (currentAuthId && activeAccountId && activeAccountId !== accountId) {
        await switchAccountUtil(activeAccountId);
      }
    } finally {
      isRefreshingRef.current = false;
    }
  }, [activeAccountId, fetchAccountUsage, updateUsage]);

  // 如果已登录且能读到 auth.json，自动用最新 session 更新当前账号用量
  useEffect(() => {
    if (!activeAccountId) {
      autoRefreshAccountIdRef.current = null;
      return;
    }

    if (autoRefreshAccountIdRef.current === activeAccountId) {
      return;
    }

    const activeAccount = accounts.find(account => account.id === activeAccountId);
    if (!activeAccount) return;

    const runAutoRefresh = async () => {
      const currentAuthAccountId = await getCurrentAuthAccountId();
      if (!currentAuthAccountId) return;

      if (activeAccount.accountInfo.accountId !== currentAuthAccountId) {
        return;
      }

      autoRefreshAccountIdRef.current = activeAccountId;
      await refreshSingleAccount(activeAccountId);
    };

    void runAutoRefresh();
  }, [accounts, activeAccountId, refreshSingleAccount]);
  
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
  
  // 设置 auth.json 检测定时器（每30秒检测一次）
  // 用于检测外部登录/登出操作并同步前端状态
  useEffect(() => {
    // 清除旧的定时器
    if (authCheckIntervalRef.current) {
      clearInterval(authCheckIntervalRef.current);
    }
    
    // 每30秒检测一次 auth.json 状态
    const AUTH_CHECK_INTERVAL = 30 * 1000; // 30秒
    authCheckIntervalRef.current = setInterval(() => {
      syncCurrentAccount();
    }, AUTH_CHECK_INTERVAL);
    
    return () => {
      if (authCheckIntervalRef.current) {
        clearInterval(authCheckIntervalRef.current);
      }
    };
  }, [syncCurrentAccount]);
  
  return {
    refreshAllUsage,
    refreshSingleAccount,
    isRefreshing: isRefreshingRef.current,
  };
}

export default useAutoRefresh;
