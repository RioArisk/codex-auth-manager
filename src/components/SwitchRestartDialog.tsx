import React, { useState } from 'react';

interface SwitchRestartDialogProps {
  isOpen: boolean;
  isSubmitting?: boolean;
  onClose: () => void;
  onConfirm: (rememberChoice: boolean) => void;
}

function SwitchRestartDialogContent({
  isSubmitting = false,
  onClose,
  onConfirm,
}: Omit<SwitchRestartDialogProps, 'isOpen'>) {
  const [rememberChoice, setRememberChoice] = useState(false);

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg mx-4 border border-[var(--dash-border)] shadow-[0_24px_60px_rgba(15,23,42,0.2)]">
        <div className="flex items-start gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-[var(--dash-text-primary)]">
              {'\u5207\u6362\u8d26\u53f7\u5e76\u91cd\u542f Codex'}
            </h2>
            <div className="text-sm text-[var(--dash-text-secondary)] mt-2 space-y-2">
              <p>
                {'\u5f53\u524d\u5207\u6362\u4f1a\u7ed3\u675f\u5e76\u91cd\u542f Codex \u76f8\u5173\u8fdb\u7a0b\uff0c\u5305\u62ec Codex App \u4e0e PowerShell \u4e2d\u8fd0\u884c\u7684 Codex\u3002'}
              </p>
              <p>
                {'\u5982\u679c\u5f53\u524d\u6709\u4f1a\u8bdd\u8fdb\u884c\u4e2d\uff0c\u8bf7\u5148\u7b49\u5f85\u5b8c\u6210\uff0c\u6216\u8005\u5728\u8bbe\u7f6e\u4e2d\u5173\u95ed\u201c\u5207\u6362\u8d26\u53f7\u540e\u81ea\u52a8\u91cd\u542f Codex\u201d\u529f\u80fd\u3002'}
              </p>
            </div>
          </div>
        </div>

        <label className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-[var(--dash-text-secondary)]">
          <input
            type="checkbox"
            checked={rememberChoice}
            onChange={(event) => setRememberChoice(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-blue-500 focus:ring-blue-400"
          />
          <span>{'\u4e0b\u6b21\u4e0d\u518d\u63d0\u793a'}</span>
        </label>

        <div className="flex gap-2 mt-5 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="h-10 px-4 bg-slate-100 hover:bg-slate-200 text-[var(--dash-text-primary)] rounded-xl text-sm transition-colors disabled:opacity-50"
          >
            {'\u53d6\u6d88'}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(rememberChoice)}
            disabled={isSubmitting}
            className="h-10 px-4 bg-[var(--dash-accent)] hover:brightness-110 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
          >
            {isSubmitting ? '\u6b63\u5728\u91cd\u542f...' : '\u786e\u8ba4\u91cd\u542f'}
          </button>
        </div>
      </div>
    </div>
  );
}

export const SwitchRestartDialog: React.FC<SwitchRestartDialogProps> = ({
  isOpen,
  isSubmitting,
  onClose,
  onConfirm,
}) => {
  if (!isOpen) return null;

  return (
    <SwitchRestartDialogContent
      isSubmitting={isSubmitting}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
};

export default SwitchRestartDialog;
