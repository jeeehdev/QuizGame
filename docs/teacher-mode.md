# 선생님 모드 공통 규칙

`.claude/commands/teacher-*.md` 명령과 웹 선생님 화면(`/teacher`의 성적표 · 학생 비교 · 약점 · 추이)이 함께 따르는 규칙입니다.

계산은 `server/src/teacher/`(`report.ts`)에 한 번만 구현되어 있고, 웹 화면(`GET /api/teacher/report`)과 명령(`npm run teacher-report`)이 같은 결과를 씁니다. 이 문서는 그 코드의 규칙 원문이므로, 규칙을 바꾸면 코드와 `report.test.ts`도 함께 바꿉니다.

## 계산 결과 얻기 (`npm run teacher-report`)

```sh
npm run -s teacher-report -- [기간] --json [--compare 1,3,5|all]
```

- DB(`DB_PATH`, 없으면 `server/data/quiz.sqlite`)를 읽기 전용으로 열어 `TeacherReport`(`shared/types.ts`) JSON을 출력한다. `--json` 없이 실행하면 요약 표를 글로 보여 준다
- `/teacher-*` 명령은 **값을 직접 계산하지 않고** 이 JSON을 그대로 쓴다. 명령이 하는 일은 고르고, 표로 만들고, 정리 문장을 쓰는 것이다
- 기간 형식이 틀리거나 명단에 없는 번호를 `--compare`에 주면 오류 문장을 출력하고 종료 코드 1로 끝난다. 그 문장을 그대로 보여 준다
- 정답률·평균은 반올림하지 않은 값이다. 보여 줄 때 반올림한다 (비율은 소수점 없이 %)

| JSON | 내용 |
| --- | --- |
| `period` | `key`, `label`(예: "최근 7일 (2026-10-09~2026-10-15)"), `from`·`to`(UTC) |
| `summary` | 학생 수·응시 수·기록 수, 미등록 기록 수, 최근 24시간 중간에 나간 게임 수, 반 평균·표준편차·중앙값·최고·최저, 반 최고 기록, 점수 구간, 빠른 기록 수와 주의(`fastWarning`), 등급별 학생 수와 등급을 매겼는지(`gradesAssigned`), ⚠️⭐를 쓰는지(`flagsShown`), 반 카테고리 정답률, 카테고리별 50% 미만 학생(`below50`) |
| `students[]` | 명단 순서(번호 순)로 모든 학생. 대표 값, 반 평균 대비, 카테고리 정답률, 강한·약한 카테고리(네 개 모두면 차이 없음), 순위·등급·⚠️⭐(`flag`), 추이(`first`, `change`, `trend`, `categoryChange`), 기록 목록(`records`, 직전 대비와 ⏱️ 포함). `playCount`가 0이면 미응시 |
| `daily[]` | 날짜별(로컬) 반 평균과 응시 학생 수, 최근 14개 날짜 |
| `weakness` | 기간 안 문제별 분석: 대상 학생, 답안이 없는 예전 기록 수(`recordsWithoutAnswers`), ⏱️ 학생(`fastStudentIds`), 오답률 상위 10문제(`questions`), 같은 오답률로 넘친 문제(`tiedQuestionIds`), 학생별로 틀린 문제(`wrongByStudent`) |
| `compare` | 비교 대상(`studentIds`, 고른 이유 `reason`), 항목별 가장 좋은 학생(`best`), 20%p 이상 차이(`gaps`), 10점 이내 쌍과 시간 차이(`closeScores`), 서로 가르쳐 줄 짝(`teachingPairs`). 비교할 수 없으면 `null`과 이유(`compareSkipped`) |

학생 id는 `students[].id`이고, 명령에서 학생을 가리킬 때는 `number`(출석 번호)를 쓴다.

## 학생 명단 (DB)

게임은 닉네임만 받으므로, 같은 학생이 여러 닉네임을 쓰면 다른 사람으로 보입니다. 명단에서 학생마다 닉네임을 묶어 줍니다. 명단은 DB(`teacher_settings`, `students`, `student_nicknames` 테이블)에 있고, 웹 선생님 화면의 "학생 명단"이나 CLI로 관리합니다.

- **읽기**: `npm run -s roster -- list --json` → `{ "className": …, "students": [{ "id", "number", "name", "nicknames": [...], "playCount" }] }`
- **명단에 없는 닉네임**: `npm run -s roster -- unmatched --json`
- **바꾸기**: 웹 화면, 또는 `npm run roster -- add|link|unlink|remove|class …` (규칙은 `server/src/roster.ts` 하나로 같다)
- **예전 파일 가져오기**: `npm run import-roster -- teacher/roster.json [--replace]`. 파일 형식은 `{ "className": "3학년 2반", "students": [{ "number": 1, "name": "김민수", "nicknames": ["민수"] }] }`
- `number`: 출석 번호(1~999, 중복 불가). 명령에서 학생을 가리킬 때 번호나 이름을 쓴다
- `nicknames`: 그 학생이 쓰는 닉네임. 한 닉네임은 한 학생에게만 속한다
- 닉네임 비교는 앞뒤 공백을 지운 뒤 **정확히 같을 때만** 같은 사람으로 본다 (대소문자도 구분). 비슷한 닉네임을 추측해서 묶지 않는다 ("비슷한 학생"은 선생님이 확인할 힌트로만 보여 준다)
- 명단에 없는 닉네임의 기록은 "미등록"으로 따로 보여 주고, 학생 통계에는 넣지 않는다
- 학생 이름은 DB(`server/data/quiz.sqlite`, gitignore 대상)에만 있다. 예전 `teacher/roster.json`과 보고서(`teacher/reports/`)도 gitignore 대상이다
- 명단에 학생이 없으면 `/teacher-roster add`나 웹 화면으로 먼저 추가하라고 안내하고 멈춘다 (`teacher-roster` 자신은 예외)

## 데이터 읽기

- DB 경로: 환경 변수 `DB_PATH`, 없으면 `server/data/quiz.sqlite`
- **읽기 전용으로만 연다**: `better-sqlite3`로 `new Database(path, { readonly: true, fileMustExist: true })`. `openDb`는 테이블을 만들므로 쓰지 않는다. `npm run teacher-report`가 이렇게 연다
- 아래 표와 SQL은 계산 코드(`reportData.ts`)가 읽는 데이터를 설명한다. 명령은 직접 쿼리하지 않고 `npm run teacher-report`를 쓴다
- 선생님 모드 명령은 DB를 절대 바꾸지 않는다. 기록 삭제는 `/quiz-leaderboard delete`나 웹 선생님 화면의 "기록 관리"로 한다 (기록의 문제별 답안도 함께 지워진다)

| 데이터 | 테이블 | 보관 기간 | 쓰는 곳 |
| --- | --- | --- | --- |
| 점수, 카테고리별 맞힌 수, 소요 시간, 플레이 시각 | `scores` | 계속 | 성적표, 비교, 추이 |
| 문제별 답안(맞았는지) | `score_answers` (`score_id`로 `scores.id`와 연결) | 그 기록과 같이 (기록을 지우면 함께 지워짐) | 문제별 약점 |
| 중간에 나간 게임 | `games` (`finished = 0`) | 시작 후 24시간 | 참여 현황 |

```sql
-- 기간 안의 완료 기록
SELECT id, nickname, score, correct_by_category, duration_sec, played_at
FROM scores WHERE played_at >= ? AND played_at < ? ORDER BY played_at;

-- 기간 안 기록의 문제별 답안 (position은 출제 순서)
SELECT a.score_id, a.question_id, a.correct FROM score_answers a
JOIN scores s ON s.id = a.score_id
WHERE s.played_at >= ? AND s.played_at < ? ORDER BY a.score_id, a.position;
```

- `correct_by_category`는 JSON(`{"history":2,"science":3,"geography":4,"arts":3}`), 카테고리마다 10문제, 점수는 맞힌 수 × 10 (400점 만점)
- `score_answers`는 기록마다 40줄(`question_id`, `correct` 0/1). 문제별 답안을 보관하기 전(#50)에 끝난 기록에는 없다. 문제 내용은 `server/data/questions.json`과 `question-candidates.json`에서 id로 찾는다
- 문제별 답안은 **학생 단위로 센다**: 한 학생이 기간 안에 여러 번 완료했으면 그 학생의 **답안이 있는 가장 최근 게임 하나만** 쓴다. 게임 수로 세면 여러 번 푼 학생이 여러 명처럼 세진다
- 답안이 없는 예전 기록은 문제별 분석에서만 빠지고, 몇 건인지 함께 보여 준다
- 중간에 나간 게임도 명단 학생의 것만 센다 (`games.nickname`을 `student_nicknames`로 찾는다)
- 카테고리 이름: history 한국사, science 과학, geography 지리, arts 예술과 문화

## 기간 인자

모든 명령이 같은 형식을 받는다. 비어 있으면 `all`.

- `all`: 전체, `today`: 오늘, `7d`·`30d`: 오늘을 포함한 최근 N일(달력 날짜, 예: 10월 15일의 `7d`는 10월 9일 0시부터), `2026-10-01~2026-10-14`: 날짜 범위(양 끝 포함)
- 날짜는 로컬 시간 기준으로 자르고, `played_at`(UTC ISO 문자열)과 비교할 때 UTC로 바꾼다
- 그 밖의 값이면 계산하지 말고 쓸 수 있는 형식을 보여 준다

## 학생 한 명의 대표 값

학생이 기간 안에 여러 번 플레이했을 수 있으므로 값을 이렇게 정한다.

- **최고 점수**: 가장 높은 점수(같으면 더 빠른 기록)
- **평균 점수**: 모든 완료 기록의 평균
- **최근 점수**: 가장 최근 기록
- **카테고리별 정답률**: 모든 완료 기록의 카테고리별 맞힌 수 합 ÷ (기록 수 × 10)
- 기록이 없는 학생은 "미응시"로 표시한다
- **반 평균**은 응시한 학생들의 평균 점수의 평균, **표준편차**는 같은 값들의 모집단 표준편차다
- **반 카테고리 정답률**도 같은 방식으로 응시한 학생들의 카테고리 정답률의 평균이다 (많이 푼 학생이 반 값을 끌고 가지 않게)
- **날짜별 반 평균**은 그날(로컬 날짜) 응시한 학생마다 그날 기록의 평균을 구한 뒤 그 값들의 평균이다
- **추이**의 처음·최근 비교는 기간 안 기록으로 한다: 기록이 4건 이상이면 처음 2건과 최근 2건, 2~3건이면 처음 1건과 최근 1건

## 빠른 기록 (⏱️)

40문제를 **80초 미만**(문제당 평균 2초 미만)에 끝낸 기록은 문제를 읽지 않고 눌렀을 수 있다. `/quiz-leaderboard check`의 "비정상적으로 빠른 기록"과 같은 기준이다.

- **분석에서 빼지 않는다.** 평균, 등급, 순위, 정답률, 추이 계산에 다른 기록과 똑같이 넣는다
- 대신 보이게 표시한다: 기록에 ⏱️를 붙이고, 학생 줄에는 "빠른 기록 N/M건"(M은 그 학생의 기간 안 기록 수)을 적는다
- 기간 안 기록의 절반 이상이 빠른 기록이면, 결과를 실력으로 보기 어렵다는 주의 문장을 요약 맨 앞에 쓴다
- 문제별 분석에 쓴 학생의 최근 게임이 빠른 기록이면 그 학생 이름 옆에도 ⏱️를 붙인다

## 등급 (상대평가)

기간 안에 응시한 명단 학생끼리 평균 점수로 순위를 매기고, 상위 비율로 등급을 정한다.

| 등급 | 상위 비율 |
| --- | --- |
| A | 상위 20% 이내 |
| B | 상위 20% 초과 ~ 40% 이내 |
| C | 상위 40% 초과 ~ 70% 이내 |
| D | 하위 30% (상위 70% 초과) |

- 상위 비율 = 순위 ÷ 응시 학생 수. 순위는 평균 점수가 같으면 같은 순위(`RANK()` 방식: 나보다 평균이 높은 학생 수 + 1)이므로, 동점인 학생은 같은 등급을 받는다
- 예: 응시 10명이면 1~2위 A, 3~4위 B, 5~7위 C, 8~10위 D. 2위가 두 명이면 둘 다 A이고 다음 학생은 4위(B)
- 미응시 학생은 등급 없이 "-"
- 등급은 점수의 절대 수준이 아니라 반 안에서의 위치다. 반 전체가 잘해도 하위 30%는 D가 된다

## 데이터가 적거나 없을 때

- 기간 안에 명단 학생의 기록이 0건이면 평균·순위·비교를 계산하지 않고 "기간 안에 응시 기록이 없습니다"라고만 쓴다 (`NaN`, `Infinity` 같은 값을 그대로 보여 주지 않는다)
- 응시한 학생이 3명 미만이면 ⚠️·⭐ 표시와 표준편차를 쓰지 않는다 (학생이 적으면 표준편차가 0에 가까워 모두 표시된다)
- 응시한 학생이 5명 미만이면 등급을 매기지 않고 "응시 학생이 5명 미만이라 등급을 매기지 않습니다"라고 쓴다 (1명이면 상위 100%라 D가 되는 것처럼, 인원이 적으면 상대평가가 의미 없다)
- 정답률이 같은 카테고리가 여럿이면 "강한/약한 카테고리"에 모두 쓰고, 네 카테고리가 모두 같으면 "차이 없음"으로 쓴다

## 출력 공통

- 학생은 `번호 이름` 순으로 보여 준다. 표 맨 위에 반 이름, 기간, 대상 학생 수, 기록 수를 적는다
- 시간은 로컬 시간, 소요 시간은 분:초, 비율은 소수점 없이 %
- 숫자만 나열하지 말고, 표 아래에 선생님이 알아야 할 점을 2~3줄로 정리한다
- 화면 출력만 한다. 파일을 만드는 것은 `/teacher-mode`(보고서 .md 저장)와 `/export-report`(CSV·PDF)뿐이고, 둘 다 `teacher/reports/`에만 쓴다
