import { lazy, Suspense } from 'react'
import App from './App.tsx'

// Teacher mode lives at /teacher and is loaded as a separate chunk, so students never download it.
const TeacherApp = lazy(() => import('./teacher/TeacherApp.tsx'))

export default function Root() {
  if (!/^\/teacher(\/|$)/.test(window.location.pathname)) return <App />
  return (
    <Suspense fallback={<p style={{ padding: 20 }}>선생님 화면을 불러오는 중…</p>}>
      <TeacherApp />
    </Suspense>
  )
}
