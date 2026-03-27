import React from 'react';

type QuickLoginPhase = 'starting' | 'waiting' | 'importing' | 'success' | 'error';

interface QuickLoginModalProps {
  isOpen: boolean;
  phase: QuickLoginPhase;
  title: string;
  message: string;
  detail?: string | null;
  canClose?: boolean;
  canCancel?: boolean;
  onClose: () => void;
  onCancel: () => void;
}

const toneClassMap: Record<QuickLoginPhase, string> = {
  starting: 'text-blue-600 bg-blue-50 border-blue-100',
  waiting: 'text-amber-600 bg-amber-50 border-amber-100',
  importing: 'text-sky-600 bg-sky-50 border-sky-100',
  success: 'text-emerald-600 bg-emerald-50 border-emerald-100',
  error: 'text-red-600 bg-red-50 border-red-100',
};

export const QuickLoginModal: React.FC<QuickLoginModalProps> = ({
  isOpen,
  phase,
  title,
  message,
  detail,
  canClose = false,
  canCancel = false,
  onClose,
  onCancel,
}) => {
  if (!isOpen) return null;

  const showSpinner = phase === 'starting' || phase === 'waiting' || phase === 'importing';
  const badgeText =
    phase === 'starting'
      ? '正在启动'
      : phase === 'waiting'
        ? '等待授权'
        : phase === 'importing'
          ? '正在导入'
          : phase === 'success'
            ? '已完成'
            : '失败';

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 border border-[var(--dash-border)] shadow-[0_24px_60px_rgba(15,23,42,0.2)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[var(--dash-text-primary)]">{title}</h2>
            <p className="text-sm text-[var(--dash-text-secondary)] mt-2 leading-6">{message}</p>
          </div>
          {canClose ? (
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center text-[var(--dash-text-muted)] hover:text-[var(--dash-text-primary)] hover:bg-slate-100 rounded-full transition-colors"
              aria-label="关闭快速登录弹窗"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : canCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="w-9 h-9 flex items-center justify-center text-[var(--dash-text-muted)] hover:text-[var(--dash-text-primary)] hover:bg-slate-100 rounded-full transition-colors"
              aria-label="取消快速登录"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : null}
        </div>

        <div className={`mt-5 rounded-2xl border px-4 py-3 ${toneClassMap[phase]}`}>
          <div className="flex items-center gap-3">
            {showSpinner ? (
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : phase === 'success' ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            <div>
              <p className="text-sm font-medium">{badgeText}</p>
              {detail ? <p className="text-xs mt-1 opacity-80 break-all">{detail}</p> : null}
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          {canClose ? (
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-[var(--dash-text-primary)] text-sm transition-colors"
            >
              关闭
            </button>
          ) : canCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="h-10 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-[var(--dash-text-primary)] text-sm transition-colors"
            >
              取消等待
            </button>
          ) : (
            <span className="text-xs text-[var(--dash-text-muted)]">
              登录窗口运行中时请不要关闭应用
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuickLoginModal;
