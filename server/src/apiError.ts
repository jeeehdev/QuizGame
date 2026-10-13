import type { Response } from 'express'
import type { ApiErrorBody, ApiErrorCode } from '../../shared/types.ts'

export function sendError(res: Response, status: number, error: ApiErrorCode, message: string) {
  res.status(status).json({ error, message } satisfies ApiErrorBody)
}
