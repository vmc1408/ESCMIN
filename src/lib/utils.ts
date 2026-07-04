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
  if (typeof date === 'string') {
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      const day = parseInt(match[3], 10);
      const d = new Date(year, month - 1, day);
      if (!isNaN(d.getTime())) {
        return new Intl.DateTimeFormat('pt-BR').format(d);
      }
    }
  }
  const d = new Date(date);
  if (isNaN(d.getTime())) return '---';
  return new Intl.DateTimeFormat('pt-BR').format(d);
}

export function safeFormat(date: string | Date | null | undefined, formatStr: string, fallback: string = '---') {
  if (!date) return fallback;
  if (typeof date === 'string') {
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      const day = parseInt(match[3], 10);
      const d = new Date(year, month - 1, day);
      if (!isNaN(d.getTime())) {
        try {
          return format(d, formatStr);
        } catch (e) {
          return fallback;
        }
      }
    }
  }
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
  
  // Try YYYY-MM-DD pure date first to avoid UTC shifts
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
    const d = new Date(year, month - 1, day);
    if (!isNaN(d.getTime())) return d;
  }
  
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

export function maskCEP(value: string) {
  return value
    .replace(/\D/g, '')
    .replace(/^(\d{5})(\d)/, '$1-$2')
    .substring(0, 9);
}

export function maskPhone(value: string) {
  return value
    .replace(/\D/g, '')
    .replace(/^(\d{2})(\d)/g, '($1) $2')
    .replace(/(\d)(\d{4})$/, '$1-$2')
    .substring(0, 15);
}

export function maskDate(value: string) {
  const digits = value.replace(/\D/g, '').substring(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.substring(0, 2)}/${digits.substring(2)}`;
  return `${digits.substring(0, 2)}/${digits.substring(2, 4)}/${digits.substring(4)}`;
}

export function formatDateForDisplay(dateStr: string | undefined | null): string {
  if (!dateStr) return '';
  
  // Handle ISO string by taking only the date part
  const pureDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  
  if (pureDate.includes('/')) {
    // Check if it's already DD/MM/YYYY
    const parts = pureDate.split('/');
    if (parts.length === 3 && parts[0].length <= 2) return pureDate;
    return pureDate;
  }
  
  const parts = pureDate.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    if (year.length === 4) return `${day}/${month}/${year}`;
    if (day.length === 4) return `${year}/${month}/${day}`; // Handles some weird cases
  }
  return pureDate;
}

export function parseDateToDB(dateStr: string | undefined | null): string | null {
  if (!dateStr) return null;
  // If already YYYY-MM-DD
  if (dateStr.includes('-') && !dateStr.includes('/')) {
    const parts = dateStr.split('-');
    if (parts[0].length === 4) return dateStr;
  }
  
  const digits = dateStr.replace(/\D/g, '');
  if (digits.length === 8) {
    const day = digits.substring(0, 2);
    const month = digits.substring(2, 4);
    const year = digits.substring(4, 8);
    return `${year}-${month}-${day}`;
  }
  
  // Fallback for partial dates or things that look like DD/MM/YYYY
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const [day, month, year] = parts;
      if (day.length === 2 && month.length === 2 && year.length === 4) {
        return `${year}-${month}-${day}`;
      }
    }
  }
  
  return null;
}
