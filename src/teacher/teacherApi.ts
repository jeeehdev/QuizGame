// Teacher API calls. Kept out of src/api/client.ts so they ship only in the teacher chunk.
// The session cookie is httpOnly and sent automatically (same origin).
import { request } from '../api/client'
import type {
  AddStudentRequest,
  RosterResponse,
  RosterStudent,
  SwapRequest,
  SwapResponse,
  TeacherQuestionsResponse,
  TeacherSessionResponse,
  UnmatchedNicknamesResponse,
} from '../types/quiz'

export const teacherApi = {
  session: () => request<TeacherSessionResponse>('/api/teacher/session'),
  login: (password: string) => request<null>('/api/teacher/login', { password }),
  logout: () => request<null>('/api/teacher/logout', {}),
  questions: () => request<TeacherQuestionsResponse>('/api/teacher/questions'),
  swap: (body: SwapRequest) => request<SwapResponse>('/api/teacher/swap', body),
  roster: () => request<RosterResponse>('/api/teacher/roster'),
  setClassName: (className: string) => request<RosterResponse>('/api/teacher/roster', { className }, 'PATCH'),
  addStudent: (body: AddStudentRequest) => request<RosterStudent>('/api/teacher/students', body),
  removeStudent: (id: number) => request<RosterStudent>(`/api/teacher/students/${id}`, undefined, 'DELETE'),
  linkNickname: (id: number, nickname: string) =>
    request<RosterStudent>(`/api/teacher/students/${id}/nicknames`, { nickname }),
  unlinkNickname: (nickname: string) =>
    request<RosterStudent>(`/api/teacher/nicknames/${encodeURIComponent(nickname)}`, undefined, 'DELETE'),
  unmatchedNicknames: () => request<UnmatchedNicknamesResponse>('/api/teacher/nicknames/unmatched'),
}

export type Loaded<T> = { data: T } | { error: unknown }

/** Runs a request and returns its data or error, so callers decide how to put it into state. */
export async function fetchResult<T>(request: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { data: await request() }
  } catch (error) {
    return { error }
  }
}
