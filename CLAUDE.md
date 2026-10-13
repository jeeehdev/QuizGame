# 상식 퀴즈 게임

4개 카테고리(한국사·과학·지리·예술과 문화) 40문제를 풀고 서버가 채점해 순위표에 올리는 웹 퀴즈 게임.
요구 사항과 단계별 구현 범위는 `docs/PRD.md`가 원문이다.

## 명령

- `npm run dev`: Vite(5173)와 API 서버(3001, `--api-only`)를 함께 실행한다. Vite가 `/api`를 API 서버로 프록시한다
- `npm test`: Vitest 전체 (클라이언트·서버·shared)
- `npm run build`: 타입 검사 → Vite 빌드 → `scripts/check-bundle.mjs`(클라이언트 번들에 문제 데이터가 새어 나가면 빌드 실패)
- `npm start`: 빌드된 `dist/`와 API를 한 서버로 제공
- `npm run lint`: oxlint
- `npm run review-doc`: `server/data/questions.json`과 `question-candidates.json`에서 `docs/questions-review.md`를 다시 만든다
- `npm run delete-score -- <id>`: 순위표 기록 하나 삭제
- `npm run swap-question -- <출제 id> <후보 id>`: 출제 문제와 같은 카테고리·난이도의 후보 문제를 바꾼다

## 구조

- `server/`: Express + better-sqlite3. 문제, 섞기, 정답 판정, 점수, 소요 시간은 모두 서버가 한다
  - `server/data/questions.json`: 출제 문제 40개. `question-candidates.json`은 출제되지 않는 후보 문제. `banned-words.txt`는 닉네임 금칙어. `quiz.sqlite*`는 gitignore 대상
  - `server/src/game/`: 순수 게임 로직과 문제 검증(`validateQuestions`, `validateCandidates`)
  - `server/src/questionBank.ts`: 출제 문제와 후보 문제 교체. 나중에 선생님 모드 API도 이 함수를 쓴다
  - `server/test/`: Supertest API 테스트
- `shared/`: 클라이언트와 서버가 함께 쓰는 API 타입(`types.ts`)과 닉네임 규칙
- `src/`: React 클라이언트. `src/api/client.ts`로만 서버와 통신하고, 화면 상태는 `src/game/reducer.ts`가 관리한다
  - `src/test/testServer.ts`: 클라이언트 테스트에서 실제 Express 앱과 메모리 DB로 fetch를 처리한다

## 지켜야 할 것

- **정답 비노출**: 클라이언트 코드와 번들에 `questions.json`을 import하지 않는다. 정답(answerIndex)과 해설은 답을 제출한 뒤 API 응답으로만 받는다
- **서버 코드는 Node가 직접 실행한다(type stripping, Node 22.18 이상)**: `server/`와 `shared/`에서는 import에 `.ts` 확장자를 붙이고, enum·namespace·파라미터 프로퍼티처럼 지워지지 않는 문법은 쓰지 않는다(`erasableSyntaxOnly`)
- 접근성(키보드 조작, 포커스 이동, 스크린 리더 문구)은 2단계 기준을 유지한다. `src/components/a11y.test.tsx`의 axe 검사가 통과해야 한다

## 문제를 추가하거나 고칠 때

1. `docs/question-guidelines.md`의 교차 검증 기준(정답이 하나인지, 최상급 표현의 기준, 시점·범위, 출처 2개 이상)을 따른다
2. 형식 제한: 문제 80자, 보기 30자, 해설 120자 이내. 출제 문제는 카테고리마다 10문제(쉬움 4 · 보통 4 · 어려움 2)로 고정
3. 새 문제는 `questions.json`에 바로 넣지 않고 `/quiz-add`로 후보 파일에 추가한 뒤, `/quiz-swap`(`npm run swap-question`)으로 같은 카테고리·난이도의 출제 문제와 바꾼다. 교체 후 서버를 재시작해야 반영된다
4. `npm test`로 검증한 뒤 `npm run review-doc`으로 검수표를 다시 만든다. 검수표는 직접 고치지 않는다
5. 검토용 명령: `/quiz-validate [카테고리]`(최상급 표현), `/quiz-range <시작> <끝>`(난이도·정답 분포), `/quiz-check [카테고리]`(정답 정확성), `/quiz-daily [개수]`(점검·후보 추가·검증·백업)
6. 운영 명령: `/quiz-stats [기간]`(게임 통계), `/quiz-leaderboard [show|find|check|delete]`(순위표 관리). DB는 읽기 전용으로 열고, 삭제는 `npm run delete-score`로만 한다

## 선생님 모드 (Claude Code 명령)

- 공통 규칙(학생 명단 형식, 읽는 데이터, 기간 인자, 대표 값)은 `docs/teacher-mode.md`
- 학생 명단 `teacher/roster.json`과 보고서 `teacher/reports/`는 학생 이름이 들어 있어 gitignore 대상이다
- `/teacher-mode [기간] [save]`가 `teacher-roster` → `teacher-scores` → `teacher-weakness` → `teacher-progress` → `teacher-compare`를 차례로 실행해 보고서를 만든다
- 웹 화면 선생님 모드(관리자 인증, 문제 교체)는 #39

## 커밋

- 메시지는 영어로 쓴다. 제목 한 줄, 본문은 `- ` 목록으로 바뀐 내용을 정리한다
- 단계 작업이 이슈를 닫으면 본문 끝에 `Closes #N`을 이슈마다 한 줄씩 쓴다. 상위 단계 이슈(#1, #11, #22 등)는 커밋으로 닫지 않고 따로 닫는다
- 서로 다른 성격의 변경(문제 데이터 수정과 문서 변경 등)은 커밋을 나눈다
