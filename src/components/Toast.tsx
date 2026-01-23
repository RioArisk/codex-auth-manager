import React from 'react';

export type ToastTone = 'success' | 'warning';

interface ToastProps {
  message: string;
  tone?: ToastTone;
}

const toneStyles: Record<ToastTone, string> = {
  success: 'border-emerald-200 bg-emerald-50/90 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50/90 text-amber-700',
};

const toneIcons: Record<ToastTone, React.ReactNode> = {
  success: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  warning: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a1.2 1.2 0 001.04 1.8h18.28a1.2 1.2 0 001.04-1.8L13.71 3.86a1.2 1.2 0 00-2.42 0z" />
    </svg>
  ),
};

export const Toast: React.FC<ToastProps> = ({ message, tone = 'success' }) => (
  <div
    className={`toast-pop pointer-events-auto flex items-center gap-2 rounded-2xl border px-4 py-2 shadow-lg backdrop-blur ${toneStyles[tone]}`}
    role="status"
  >
    {toneIcons[tone]}
    <span className="text-sm font-medium max-w-[260px]">{message}</span>
  </div>
);

export default Toast;
