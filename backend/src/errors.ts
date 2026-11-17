export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string, public details?: unknown) {
    super(message ?? code)
  }
}

export const unauthenticated = () => new HttpError(401, 'UNAUTHENTICATED', 'Authentication required')
export const forbidden = (code = 'FORBIDDEN') => new HttpError(403, code, 'You do not have permission to do this')
export const notFound = () => new HttpError(404, 'NOT_FOUND', 'Resource not found')
export const conflict = (code: string, message?: string) => new HttpError(409, code, message)
export const invalid = (code: string, message?: string) => new HttpError(422, code, message)
