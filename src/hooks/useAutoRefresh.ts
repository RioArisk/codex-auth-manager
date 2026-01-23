import { useEffect, useRef, useCallback } from 'react';
import { useAccountStore } from '../stores/useAccountStore';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentAuthAccountId } from '../utils/storage';
import type { UsageInfo } from '../types';

/**
 * Rust 后端返回的用量数据结构
 */
interface RustUsageData {
  five_hour_percent_left: number;
  five_hour_reset_time_ms: number;
  weekly_percent_left: number;
  weekly_reset_time_ms: number;
  last_updated: string;
  source_file?: string;
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

  type RefreshStatus = 'success' | 'no-usage' | 'skipped';
  type RefreshResult = { status: RefreshStatus };
  type RefreshAllResult = { updated: number; missing: number; skipped: boolean };

  const formatResetTime = (resetTimeMs: number, includeWeekday: boolean): string => {
    if (!Number.isFinite(resetTimeMs) || resetTimeMs <= 0) {
      throw new Error('Invalid reset timestamp');
    }

    const date = new Date(resetTimeMs);
    if (Number.isNaN(date.getTime())) {
      throw new Error('Invalid reset timestamp');
    }

    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    if (!includeWeekday) {
      return `${hours}:${minutes}`;
    }
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return `${weekdays[date.getDay()]} ${hours}:${minutes}`;
  };

  const buildUsageInfo = (usageData: RustUsageData, fallbackSourceFile?: string): UsageInfo => ({
    fiveHourLimit: {
      percentLeft: Math.round(usageData.five_hour_percent_left),
      resetTime: formatResetTime(usageData.five_hour_reset_time_ms, false),
    },
    weeklyLimit: {
      percentLeft: Math.round(usageData.weekly_percent_left),
      resetTime: formatResetTime(usageData.weekly_reset_time_ms, true),
    },
    lastUpdated: usageData.last_updated,
    sourceFile: usageData.source_file ?? fallbackSourceFile,
  });
  
  /**
   * 获取单个账号的用量信息
   * 通过解析本地 ~/.codex/sessions 日志文件获取真实数据
   *
   * 重要逻辑：
   * - 后端会把新建 session 文件与当前 auth.json 绑定
   * - 查询时直接使用该账号最新绑定的 session 文件
   */
  const fetchAccountUsage = useCallback(async (accountId: string): Promise<UsageInfo | null> => {
    try {
      // 找到账号信息
      const account = accounts.find(a => a.id === accountId);
      if (!account) return null;
      const usageData = await invoke<RustUsageData>('get_bound_usage', {
        accountId: account.accountInfo.accountId,
      });
      return buildUsageInfo(usageData);
    } catch (error) {
      console.error(`Failed to fetch usage for account ${accountId}:`, error);
      return null;
    }
  }, [accounts]);
  
  /**
   * 刷新所有账号的用量
   */
  const refreshAllUsage = useCallback(async (): Promise<RefreshAllResult> => {
    if (isRefreshingRef.current || accounts.length === 0) {
      return { updated: 0, missing: 0, skipped: true };
    }
    
    isRefreshingRef.current = true;
    let updated = 0;
    let missing = 0;
    
    try {
      for (const account of accounts) {
        const usage = await fetchAccountUsage(account.id);
        if (usage) {
          await updateUsage(account.id, usage);
          updated += 1;
        } else {
          missing += 1;
        }
        // 添加小延迟避免过快切换
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      return { updated, missing, skipped: false };
    } finally {
      isRefreshingRef.current = false;
    }
  }, [accounts, fetchAccountUsage, updateUsage]);
  
  /**
   * 刷新单个账号的用量
   */
  const refreshSingleAccount = useCallback(async (accountId: string): Promise<RefreshResult> => {
    if (isRefreshingRef.current) {
      return { status: 'skipped' };
    }
    
    isRefreshingRef.current = true;
    let status: RefreshStatus = 'no-usage';
    
    try {
      const usage = await fetchAccountUsage(accountId);
      if (usage) {
        await updateUsage(accountId, usage);
        status = 'success';
      }

      return { status };
    } finally {
      isRefreshingRef.current = false;
    }
  }, [fetchAccountUsage, updateUsage]);

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
      void refreshAllUsage();
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
