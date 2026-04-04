import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatDate(date: Date | string | null): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('nl-BE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date));
}

export function formatNumber(num: number | null): string {
  if (num === null || num === undefined) return '—';
  return new Intl.NumberFormat('nl-BE').format(num);
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}

export function getYearsInBusiness(foundedDate: string | null): number | null {
  if (!foundedDate) return null;
  const founded = new Date(foundedDate);
  const now = new Date();
  return Math.floor((now.getTime() - founded.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
}

export function buildSearchParams(
  filters: Record<string, string | number | boolean | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '' && value !== null) {
      params.set(key, String(value));
    }
  }
  return params.toString();
}
