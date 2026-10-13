// Manages the class roster in the database (same rules as the teacher API).
// Usage: npm run roster -- <작업> …   (작업 목록은 인자 없이 실행하면 나온다)
import { readFileSync } from 'node:fs'
import { config } from '../config.ts'
import { openDb } from '../db.ts'
import {
  addStudent,
  getRoster,
  importRoster,
  linkNickname,
  listStudents,
  removeStudent,
  RosterError,
  setClassName,
  unlinkNickname,
  unmatchedNicknames,
} from '../roster.ts'

const USAGE = `사용법: npm run roster -- <작업>
  list [--json]                     명단 보기
  class <반 이름>                   반 이름 정하기
  add <번호> <이름> [닉네임...]     학생 추가
  link <번호> <닉네임>              학생에게 닉네임 연결
  unlink <닉네임>                   닉네임 연결 해제
  remove <번호>                     명단에서 빼기 (기록은 남음)
  unmatched [--json]                명단에 없는 닉네임 보기
  import <파일> [--replace]         teacher/roster.json 형식 파일 가져오기`

const args = process.argv.slice(2)
const json = args.includes('--json')
const replace = args.includes('--replace')
const [action, ...rest] = args.filter((a) => a !== '--json' && a !== '--replace')

const db = openDb(config.dbPath)
const local = (iso: string) => new Date(iso).toLocaleString('sv-SE').slice(0, 16)

function idOf(numberText: string | undefined): number {
  const student = listStudents(db).find((s) => s.number === Number(numberText))
  if (!student) throw new RosterError('STUDENT_NOT_FOUND', `${numberText ?? ''}번 학생이 명단에 없습니다.`)
  return student.id
}

function printRoster() {
  const roster = getRoster(db)
  if (json) return console.log(JSON.stringify(roster, null, 2))
  console.log(`${roster.className || '(반 이름 없음)'} · 학생 ${roster.students.length}명`)
  for (const s of roster.students) {
    console.log(`${s.number}\t${s.name}\t${s.nicknames.join(', ') || '-'}\t${s.playCount > 0 ? `기록 ${s.playCount}건` : '미응시'}`)
  }
}

try {
  switch (action) {
    case 'list':
      printRoster()
      break
    case 'class':
      setClassName(db, rest.join(' '))
      printRoster()
      break
    case 'add': {
      const [number, name, ...nicknames] = rest
      addStudent(db, { number: Number(number), name, nicknames })
      printRoster()
      break
    }
    case 'link':
      linkNickname(db, idOf(rest[0]), rest[1])
      printRoster()
      break
    case 'unlink':
      unlinkNickname(db, rest[0])
      printRoster()
      break
    case 'remove': {
      const removed = removeStudent(db, idOf(rest[0]))
      console.log(`명단에서 뺐습니다: ${removed.number}번 ${removed.name} (기록은 그대로 남습니다)`)
      printRoster()
      break
    }
    case 'unmatched': {
      const list = unmatchedNicknames(db)
      if (json) {
        console.log(JSON.stringify({ nicknames: list }, null, 2))
        break
      }
      const byId = new Map(listStudents(db).map((s) => [s.id, `${s.number}번 ${s.name}`]))
      if (list.length === 0) console.log('명단에 없는 닉네임이 없습니다.')
      for (const n of list) {
        const similar = n.similarStudentIds.map((id) => byId.get(id)).join(', ')
        console.log(
          `${n.nickname}\t기록 ${n.playCount}건\t최고 ${n.bestScore}점\t${local(n.firstPlayedAt)} ~ ${local(n.lastPlayedAt)}${similar ? `\t확인 필요: ${similar}와 비슷` : ''}`,
        )
      }
      break
    }
    case 'import': {
      if (!rest[0]) throw new RosterError('INVALID_REQUEST', '가져올 파일 경로를 적어 주세요.')
      const result = importRoster(db, JSON.parse(readFileSync(rest[0], 'utf8')), { replace })
      console.log(`가져왔습니다: ${result.className} · 학생 ${result.studentCount}명 · 닉네임 ${result.nicknameCount}개`)
      printRoster()
      break
    }
    default:
      console.error(USAGE)
      process.exitCode = 1
  }
} catch (error) {
  console.error(error instanceof RosterError || error instanceof SyntaxError ? error.message : error)
  process.exitCode = 1
} finally {
  db.close()
}
