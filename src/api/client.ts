import type {
  AnswerRequest,
  AnswerResponse,
  ApiErrorBody,
  CreateGameResponse,
  FinishResponse,
  LeaderboardResponse,
} from '../types/quiz'

const TIMEOUT_MS = 10_000

export class ApiError extends Error {
  /** HTTP status, or 0 when the server could not be reached. */
  readonly status: number
  readonly code: string | undefined

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new ApiError('서버에 연결하지 못했습니다. 네트워크 연결을 확인해 주세요.', 0)
  }
  const data = (await response.json().catch(() => null)) as T | ApiErrorBody | null
  if (!response.ok) {
    const error = data as ApiErrorBody | null
    throw new ApiError(error?.message ?? `요청이 실패했습니다. (${response.status})`, response.status, error?.error)
  }
  return data as T
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
}

export const api = {
  createGame: (nickname: string) => request<CreateGameResponse>('/api/games', { nickname }),
  answer: (gameId: string, body: AnswerRequest) =>
    request<AnswerResponse>(`/api/games/${encodeURIComponent(gameId)}/answers`, body),
  finish: (gameId: string) => request<FinishResponse>(`/api/games/${encodeURIComponent(gameId)}/finish`, {}),
  leaderboard: (limit = 10) => request<LeaderboardResponse>(`/api/leaderboard?limit=${limit}`),
}
