// 分 -> 元
export function formatYuan(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export const ORDER_STATUS_TEXT: Record<string, { text: string; className: string }> = {
  created: { text: '已创建', className: 'bg-blue-100 text-blue-700' },
  completed: { text: '已完成', className: 'bg-green-100 text-green-700' },
  cancelled: { text: '已取消', className: 'bg-gray-200 text-gray-600' },
};
