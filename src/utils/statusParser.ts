/**
 * 获取进度条颜色
 */
export function getProgressBarColor(percentLeft: number): string {
  if (percentLeft >= 70) return 'bg-green-500';
  if (percentLeft >= 40) return 'bg-yellow-500';
  if (percentLeft >= 20) return 'bg-orange-500';
  return 'bg-red-500';
}
