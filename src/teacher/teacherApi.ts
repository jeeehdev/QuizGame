// Teacher API calls. Kept out of src/api/client.ts so they ship only in the teacher chunk.
// The session cookie is httpOnly and sent automatically (same origin).
import { request } from '../api/client'
import type { SwapRequest, SwapResponse, TeacherQuestionsResponse, TeacherSessionResponse } from '../types/quiz'

export const teacherApi = {
  session: () => request<TeacherSessionResponse>('/api/teacher/session'),
  login: (password: string) => request<null>('/api/teacher/login', { password }),
  logout: () => request<null>('/api/teacher/logout', {}),
  questions: () => request<TeacherQuestionsResponse>('/api/teacher/questions'),
  swap: (body: SwapRequest) => request<SwapResponse>('/api/teacher/swap', body),
}
