import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export const PARSE_VERSION = '1.0.0'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function randomId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 11)}`
}

export async function sha256Hex(data: ArrayBuffer | string): Promise<string> {
  const payload =
    typeof data === 'string' ? new TextEncoder().encode(data).buffer : data
  const digest = await crypto.subtle.digest('SHA-256', payload)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function titleCase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase())
}

export function parseAmount(value: string | number | null | undefined): number {
  if (typeof value === 'number') return value
  if (!value) return 0
  const normalized = value.toString().replace(/[^0-9.-]/g, '')
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

export function toIsoDate(value: string | number | Date | undefined | null): string {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

export function amountToCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(amount)
}
