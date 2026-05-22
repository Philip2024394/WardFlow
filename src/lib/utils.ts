import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(iso: string, locale: 'id' | 'en' = 'id'): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.floor((now - then) / 60000);
  if (diffMin < 1) return locale === 'id' ? 'baru saja' : 'just now';
  if (diffMin < 60) return locale === 'id' ? `${diffMin}m lalu` : `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return locale === 'id' ? `${diffH}j lalu` : `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return locale === 'id' ? `${diffD}h lalu` : `${diffD}d ago`;
}

export function riskColorClass(level: 'green' | 'yellow' | 'orange' | 'red'): string {
  switch (level) {
    case 'green':
      return 'bg-risk-green';
    case 'yellow':
      return 'bg-risk-yellow';
    case 'orange':
      return 'bg-risk-orange';
    case 'red':
      return 'bg-risk-red';
  }
}
