import { readStored, TOKEN_KEY, writeStored } from './storage'

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api'

export class ApiError extends Error {
  constructor(public status: number, public code: string, message?: string) { super(message ?? code) }
}

let token: string | null = readStored(TOKEN_KEY)
let onAuthFailure: (() => void) | undefined
export const getToken = () => token
export const setToken = (value: string | null) => { token = value; writeStored(TOKEN_KEY, value) }
export const setAuthFailureHandler = (handler: () => void) => { onAuthFailure = handler }

type Options = { method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; body?: unknown }

export async function api<T = unknown>(path: string, { method = 'GET', body }: Options = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch { throw new ApiError(0, 'NETWORK') }
  if (response.status === 204) return undefined as T
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const error = data?.error as { code?: string; message?: string } | undefined
    const code = error?.code ?? (response.status >= 500 ? 'UNKNOWN' : 'UNKNOWN')
    // Jeton expiré / révoqué ou compte désactivé : on referme la session côté client.
    if (token && (code === 'UNAUTHENTICATED' || code === 'ACCOUNT_DISABLED')) onAuthFailure?.()
    throw new ApiError(response.status, code, error?.message)
  }
  return data as T
}

export const errorKey = (error: unknown) => (error instanceof ApiError ? `err.${error.code}` : 'err.UNKNOWN')

/** Télécharge une réponse authentifiée (CSV, JSON…) en tant que fichier. */
export async function downloadFile(path: string, filename: string) {
  let response: Response
  try { response = await fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }) } catch { throw new ApiError(0, 'NETWORK') }
  if (!response.ok) throw new ApiError(response.status, 'UNKNOWN')
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url; link.download = filename; link.click()
  URL.revokeObjectURL(url)
}
