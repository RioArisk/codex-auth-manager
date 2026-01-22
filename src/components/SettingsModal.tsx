import React, { useState } from 'react';
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
  const [isSaving, setIsSaving] = useState(false);
  
  if (!isOpen) return null;
  
  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({ autoRefreshInterval });
      onClose();
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setIsSaving(false);
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-stone-800 rounded-2xl p-6 w-full max-w-md mx-4 border border-stone-700 shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white">设置</h2>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="space-y-6">
          {/* 自动刷新间隔 */}
          <div>
            <label className="block text-stone-300 text-sm font-medium mb-2">
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
                className="flex-1 h-2 bg-stone-700 rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-white font-medium w-20 text-right">
                {autoRefreshInterval === 0 ? '禁用' : `${autoRefreshInterval} 分钟`}
              </span>
            </div>
            <p className="text-xs text-stone-500 mt-2">
              设置为0禁用自动刷新。建议设置10-30分钟以避免频繁切换账号。
            </p>
          </div>
          
          {/* 关于 */}
          <div className="pt-4 border-t border-stone-700">
            <h3 className="text-stone-300 text-sm font-medium mb-3">关于</h3>
            <div className="space-y-2 text-sm text-stone-400">
              <p>Codex Manager v0.1.0</p>
              <p>管理多个 OpenAI Codex 账号的桌面工具</p>
              <p className="text-xs text-stone-500 mt-2">
                所有数据存储在本地，不会上传到任何服务器。
              </p>
            </div>
          </div>
        </div>
        
        {/* 操作按钮 */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-stone-700 hover:bg-stone-600 text-white rounded-lg font-medium transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-stone-600 text-white rounded-lg font-medium transition-colors"
          >
            {isSaving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
