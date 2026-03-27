import React, { useState } from 'react';
import type { AppConfig } from '../types';

interface CloseBehaviorDialogProps {
  isOpen: boolean;
  defaultBehavior: AppConfig['closeBehavior'];
  onClose: () => void;
  onConfirm: (behavior: Exclude<AppConfig['closeBehavior'], 'ask'>, remember: boolean) => void;
}

export const CloseBehaviorDialog: React.FC<CloseBehaviorDialogProps> = ({
  isOpen,
  defaultBehavior,
  onClose,
  onConfirm,
}) => {
  const [selectedBehavior, setSelectedBehavior] = useState<Exclude<AppConfig['closeBehavior'], 'ask'>>(
    defaultBehavior === 'exit' ? 'exit' : 'tray'
  );
  const [rememberChoice, setRememberChoice] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 border border-[var(--dash-border)] shadow-[0_24px_60px_rgba(15,23,42,0.2)]">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-[var(--dash-text-primary)]">关闭应用</h2>
          <p className="text-sm text-[var(--dash-text-secondary)] mt-2">
            请选择关闭应用时的处理方式。
          </p>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setSelectedBehavior('tray')}
            className={`w-full rounded-2xl border p-4 text-left transition-colors ${
              selectedBehavior === 'tray'
                ? 'border-blue-500 bg-blue-50'
                : 'border-[var(--dash-border)] hover:border-slate-300 bg-white'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 h-4 w-4 rounded-full border ${selectedBehavior === 'tray' ? 'border-blue-500 bg-blue-500 shadow-[inset_0_0_0_3px_white]' : 'border-slate-300 bg-white'}`} />
              <div>
                <div className="text-sm font-medium text-[var(--dash-text-primary)]">最小化到后台</div>
                <div className="text-xs text-[var(--dash-text-muted)] mt-1">
                  关闭主窗口，但保留后台运行状态。
                </div>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSelectedBehavior('exit')}
            className={`w-full rounded-2xl border p-4 text-left transition-colors ${
              selectedBehavior === 'exit'
                ? 'border-rose-500 bg-rose-50'
                : 'border-[var(--dash-border)] hover:border-slate-300 bg-white'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 h-4 w-4 rounded-full border ${selectedBehavior === 'exit' ? 'border-rose-500 bg-rose-500 shadow-[inset_0_0_0_3px_white]' : 'border-slate-300 bg-white'}`} />
              <div>
                <div className="text-sm font-medium text-[var(--dash-text-primary)]">直接关闭应用</div>
                <div className="text-xs text-[var(--dash-text-muted)] mt-1">
                  立即结束本次运行。
                </div>
              </div>
            </div>
          </button>

          <label className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-[var(--dash-text-secondary)]">
            <input
              type="checkbox"
              checked={rememberChoice}
              onChange={(event) => setRememberChoice(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-500 focus:ring-blue-400"
            />
            <span>记住这次选择，可在设置中重新修改</span>
          </label>
        </div>

        <div className="flex gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-10 bg-slate-100 hover:bg-slate-200 text-[var(--dash-text-primary)] rounded-xl text-sm transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selectedBehavior, rememberChoice)}
            className="flex-1 h-10 bg-[var(--dash-accent)] hover:brightness-110 text-white rounded-xl text-sm font-medium transition-colors"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
};

export default CloseBehaviorDialog;
