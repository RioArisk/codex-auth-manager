import React, { useState, useEffect } from 'react';
import type { AppConfig } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  config: AppConfig;
  onClose: () => void;
  onSave: (config: Partial<AppConfig>) => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  config,
  onClose,
  onSave,
}) => {
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(config.autoRefreshInterval);
  const [proxyEnabled, setProxyEnabled] = useState(config.proxyEnabled);
  const [proxyUrl, setProxyUrl] = useState(config.proxyUrl);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setAutoRefreshInterval(config.autoRefreshInterval);
    setProxyEnabled(config.proxyEnabled);
    setProxyUrl(config.proxyUrl);
  }, [isOpen, config.autoRefreshInterval, config.proxyEnabled, config.proxyUrl]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({ autoRefreshInterval, proxyEnabled, proxyUrl });
      onClose();
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm mx-4 border border-[var(--dash-border)] shadow-[0_24px_60px_rgba(15,23,42,0.2)]">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-base font-semibold text-[var(--dash-text-primary)]">设置</h2>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center text-[var(--dash-text-muted)] hover:text-[var(--dash-text-primary)] hover:bg-slate-100 rounded-full transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-5">
          {/* 自动刷新间隔 */}
          <div>
            <label className="block text-[var(--dash-text-secondary)] text-xs font-medium mb-2">
              自动刷新间隔
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0"
                max="60"
                step="5"
                value={autoRefreshInterval}
                onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
                className="flex-1 h-1 bg-slate-200 rounded appearance-none cursor-pointer accent-blue-500"
              />
              <span className="text-[var(--dash-text-primary)] text-sm w-16 text-right tabular-nums">
                {autoRefreshInterval === 0 ? '禁用' : `${autoRefreshInterval} 分钟`}
              </span>
            </div>
            <p className="text-xs text-[var(--dash-text-muted)] mt-2">
              设置为 0 禁用自动刷新
            </p>
          </div>

          {/* 代理设置 */}
          <div className="pt-4 border-t border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[var(--dash-text-primary)]">启用代理</p>
                <p className="text-xs text-[var(--dash-text-muted)] mt-1">
                  用于访问 chatgpt.com/wham/usage
                </p>
              </div>
              <button
                type="button"
                onClick={() => setProxyEnabled(!proxyEnabled)}
                className={`relative h-8 w-14 rounded-full transition-colors ${
                  proxyEnabled ? 'bg-emerald-500' : 'bg-slate-200'
                }`}
              >
                <span
                  className={`absolute top-1 left-1 h-6 w-6 bg-white rounded-full shadow transition-transform ${
                    proxyEnabled ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            <div>
              <label className="block text-[var(--dash-text-secondary)] text-xs font-medium mb-1.5">
                代理地址
              </label>
              <input
                type="text"
                value={proxyUrl}
                onChange={(e) => setProxyUrl(e.target.value)}
                placeholder="http://127.0.0.1:7890"
                className="w-full h-10 px-3 bg-white border border-[var(--dash-border)] rounded-xl text-sm text-[var(--dash-text-primary)] placeholder-[var(--dash-text-muted)] focus:border-blue-400 outline-none transition-colors"
              />
              <p className="text-xs text-[var(--dash-text-muted)] mt-1">
                支持 http(s) 或 socks5，例如 socks5://127.0.0.1:7890
              </p>
            </div>
          </div>

          {/* 关于 */}
          <div className="pt-4 border-t border-slate-200">
            <h3 className="text-[var(--dash-text-secondary)] text-xs font-medium mb-2">关于</h3>
            <div className="space-y-1 text-sm text-[var(--dash-text-secondary)]">
              <p>Codex Manager v0.1.2</p>
              <p className="text-xs text-[var(--dash-text-muted)]">
                管理多个 OpenAI Codex 账号的桌面工具
              </p>
              <p className="text-xs text-[var(--dash-text-muted)] mt-2">
                所有数据存储在本地
              </p>
            </div>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 h-10 bg-slate-100 hover:bg-slate-200 text-[var(--dash-text-primary)] rounded-xl text-sm transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 h-10 bg-[var(--dash-accent)] hover:brightness-110 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-sm font-medium transition-colors"
          >
            {isSaving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
