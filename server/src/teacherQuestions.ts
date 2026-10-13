// Teacher API for the question bank: list questions in play and candidates, and swap one for another.
// Mounted after requireTeacher (teacherAuth.ts), so every route here needs a teacher session.
import { readFileSync } from 'node:fs'
import { Router } from 'express'
import type { SwapResponse, TeacherQuestionsResponse } from '../../shared/types.ts'
import { sendError } from './apiError.ts'
import { loadQuestions } from './game/validateQuestions.ts'
import { loadCandidateFile, QuestionBankError, swapQuestionFiles, type SwapResult } from './questionBank.ts'

export interface QuestionFiles {
  bankPath: string | URL
  candidatesPath: string | URL
}

export interface TeacherQuestionsOptions {
  files: QuestionFiles
  /** Called after the files are written, to put the new lists into the running server. */
  onSwap: (result: SwapResult) => void
}

/** Reads both files as they are on disk now (candidates added by /quiz-add while the server runs are included). */
function readQuestionFiles({ bankPath, candidatesPath }: QuestionFiles): TeacherQuestionsResponse {
  const bank = loadQuestions(JSON.parse(readFileSync(bankPath, 'utf8')))
  return { bank, candidates: loadCandidateFile(candidatesPath, bank) }
}

export function createTeacherQuestionsRouter({ files, onSwap }: TeacherQuestionsOptions) {
  const router = Router()

  router.get('/questions', (_req, res) => {
    res.json(readQuestionFiles(files) satisfies TeacherQuestionsResponse)
  })

  router.post('/swap', (req, res) => {
    const { bankId, candidateId } = req.body ?? {}
    if (typeof bankId !== 'string' || typeof candidateId !== 'string' || !bankId || !candidateId) {
      return sendError(res, 400, 'INVALID_REQUEST', '바꿀 출제 문제와 후보 문제를 골라 주세요.')
    }
    let result: SwapResult
    try {
      result = swapQuestionFiles(files.bankPath, files.candidatesPath, bankId, candidateId)
    } catch (error) {
      if (error instanceof QuestionBankError) return sendError(res, 400, 'SWAP_REJECTED', error.message)
      throw error
    }
    onSwap(result)
    console.log(`Teacher swap: ${result.removed.id} → ${result.added.id}`)
    res.json({
      added: result.added,
      removed: result.removed,
      bank: result.bank,
      candidates: result.candidates,
    } satisfies SwapResponse)
  })

  return router
}
