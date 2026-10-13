---
description: 선생님 모드 학생 명단 관리 (학생 ↔ 닉네임 연결, DB)
argument-hint: "[list | class <반 이름> | add <번호> <이름> <닉네임...> | link <번호> <닉네임> | unlink <닉네임> | remove <번호> | unmatched | import <파일>]"
---

선생님 모드의 학생 명단을 관리해 줘. 명단은 DB에 있고, 규칙은 `docs/teacher-mode.md`의 "학생 명단"을 따른다.

작업: $ARGUMENTS
- 첫 단어가 작업, 나머지가 인자다. 비어 있으면 `list`
- 알 수 없는 작업이거나 인자가 모자라면 아무것도 바꾸지 말고 아래 작업 목록을 보여 준다

## 실행 방법

모든 작업은 `npm run roster -- <작업> <인자>`를 그대로 실행한다. 이 CLI가 웹 선생님 화면과 같은 코드(`server/src/roster.ts`)로 검증하므로, **DB나 파일을 직접 고치지 않는다.**

| 작업 | 실행 | 하는 일 |
| --- | --- | --- |
| `list` | `npm run roster -- list` | 번호 · 이름 · 닉네임 · 기록 수(없으면 미응시) |
| `class <반 이름>` | `npm run roster -- class <반 이름>` | 반 이름 정하기 |
| `add <번호> <이름> <닉네임...>` | `npm run roster -- add …` | 학생 추가 (닉네임 0개 이상) |
| `link <번호> <닉네임>` | `npm run roster -- link …` | 학생에게 닉네임 연결 |
| `unlink <닉네임>` | `npm run roster -- unlink …` | 닉네임 연결 해제 |
| `remove <번호>` | `npm run roster -- remove …` | 명단에서 빼기 (기록은 남음) |
| `unmatched` | `npm run roster -- unmatched` | 명단에 없는 닉네임과 "확인 필요"(비슷한 학생) |
| `import <파일>` | `npm run import-roster -- <파일>` | 예전 `teacher/roster.json` 형식 파일 가져오기 |

## 지키는 것

- `remove`는 실행하기 전에 그 학생의 번호·이름·닉네임을 `list`로 보여 주고 **확인을 받은 뒤에** 실행한다
- `import`는 DB에 학생이 이미 있으면 CLI가 거부한다. 바꿔 쓸지 사용자에게 묻고, 그렇다고 하면 `--replace`를 붙여 다시 실행한다
- `unmatched`의 "확인 필요"는 힌트일 뿐이다. 직접 연결하지 말고 `link` 명령을 안내한다
- CLI가 오류를 내면(번호 중복, 닉네임 형식, 이미 연결된 닉네임 등) 오류 문구를 그대로 보여 주고 멈춘다
- 바꾸는 작업이 끝나면 CLI가 출력한 명단을 표로 보여 준다
- 웹 선생님 화면(`/teacher`의 "학생 명단")에서도 같은 일을 할 수 있다고 한 줄 안내한다
