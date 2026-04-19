import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { format } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function formatDate(date: string | Date | null | undefined) {
  if (!date) return '---';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '---';
  return new Intl.DateTimeFormat('pt-BR').format(d);
}

export function safeFormat(date: string | Date | null | undefined, formatStr: string, fallback: string = '---') {
  if (!date) return fallback;
  const d = new Date(date);
  if (isNaN(d.getTime())) return fallback;
  try {
    return format(d, formatStr);
  } catch (e) {
    return fallback;
  }
}

export function parseSafeDate(dateValue: any): Date {
  if (!dateValue) return new Date();
  
  if (dateValue instanceof Date) {
    return isNaN(dateValue.getTime()) ? new Date() : dateValue;
  }
  
  const dateStr = String(dateValue).trim();
  
  // Try ISO or YYYY-MM-DD
  let d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  
  // Try DD/MM/YYYY
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parts[2].length === 2 ? 2000 + parseInt(parts[2], 10) : parseInt(parts[2], 10);
      d = new Date(year, month, day, 12, 0, 0);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // Excel numeric date
  const num = Number(dateValue);
  if (!isNaN(num) && num > 30000) {
    const excelDate = new Date(Math.round((num - 25569) * 86400 * 1000));
    if (!isNaN(excelDate.getTime())) return excelDate;
  }
  
  return new Date();
}
