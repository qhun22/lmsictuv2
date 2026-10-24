// Port từ api_submit_exam trong django/lmsictu/views.py

export type QuestionResult = {
  index: number
  type: string
  correct: boolean
  user_answer: unknown
  correct_answer: string
}

type Option = { label: string; text?: string; correct?: boolean }
type Statement = { text?: string; answer?: string; ordering_words?: string[]; ordering_sequence?: string[] }
type DragGroup = { label?: string; answers?: string[] }
type DragSentence = { text?: string; answer?: string }

type Question = {
  type?: string
  statements?: Statement[]
  correct_options?: Option[]
  answer?: string
  ordering_sequence?: string[]
  fill_blank_answer?: string
  drag_groups?: DragGroup[]
  drag_sentences?: DragSentence[]
  [key: string]: unknown
}

export function scoreExam(
  questions: Question[],
  answers: Record<string, unknown>
): { results: QuestionResult[]; correct: number; total: number; score: number } {
  const total = questions.length
  let correct = 0
  const results: QuestionResult[] = []

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    const qtype = q.type ?? 'unknown'
    const userAnsRaw = answers[String(i)] ?? ''
    let correctAns = ''
    let isCorrect = false

    if (qtype === 'true_false') {
      const statements = q.statements ?? []
      if (statements.length > 0) {
        const userAnswers: Record<string, string> =
          typeof userAnsRaw === 'object' && userAnsRaw !== null && !Array.isArray(userAnsRaw)
            ? (userAnsRaw as Record<string, string>)
            : {}
        const stmtResults = statements.map((stmt, si) => {
          const expected = stmt.answer
          const actual = String(userAnswers[String(si)] ?? '').toLowerCase()
          return actual === expected
        })
        isCorrect = stmtResults.length > 0 && stmtResults.every(Boolean)
        correctAns = statements.map((s) => s.answer ?? '').join(',')
      } else {
        const correctOptions = q.correct_options ?? []
        if (correctOptions.length > 0) {
          const co = correctOptions[0]
          const coText = String(co.text ?? '').toLowerCase()
          const coLabel = String(co.label ?? '').toUpperCase()
          correctAns = coLabel === 'A' || coText.includes('đúng') ? 'true' : 'false'
        } else {
          correctAns = String(q.answer ?? '').toLowerCase()
        }
        isCorrect = String(userAnsRaw).toLowerCase() === correctAns
      }
    } else if (qtype === 'single_choice' || qtype === 'multiple_response') {
      const correctOpts = (q.correct_options ?? []).map((o) => o.label ?? '')
      correctAns = correctOpts.join(',')
      if (qtype === 'multiple_response') {
        const selected = Array.isArray(userAnsRaw) ? userAnsRaw.map(String) : [String(userAnsRaw)]
        const selectedSet = new Set(selected.map((l) => l.toUpperCase()))
        const correctSet = new Set(correctOpts.map((l) => l.toUpperCase()))
        isCorrect =
          selectedSet.size === correctSet.size && [...selectedSet].every((l) => correctSet.has(l))
      } else {
        const selected = Array.isArray(userAnsRaw) && userAnsRaw.length > 0
          ? String(userAnsRaw[0])
          : String(userAnsRaw)
        isCorrect = correctOpts.map((o) => o.toUpperCase()).includes(selected.toUpperCase())
      }
    } else if (qtype === 'ordering') {
      const statements = q.statements ?? []
      if (statements.length > 0) {
        const userAnswers: Record<string, string> =
          typeof userAnsRaw === 'object' && userAnsRaw !== null && !Array.isArray(userAnsRaw)
            ? (userAnsRaw as Record<string, string>)
            : {}
        const stmtResults = statements.map((stmt, si) => {
          const expected = (stmt.ordering_sequence ?? []).join('|').toUpperCase()
          const actual = String(userAnswers[String(si)] ?? '').toUpperCase()
          return actual === expected
        })
        isCorrect = stmtResults.length > 0 && stmtResults.every(Boolean)
        correctAns = statements
          .map((s) => (s.ordering_sequence ?? []).join('|'))
          .join(';')
      } else {
        const seq = (q.ordering_sequence as string[] | undefined) ?? []
        correctAns = seq.join(',')
        isCorrect = String(userAnsRaw).toUpperCase() === correctAns.toUpperCase()
      }
    } else if (qtype === 'fill_in_blank') {
      const blankAns = String(q.fill_blank_answer ?? '').trim().toLowerCase()
      isCorrect = String(userAnsRaw).trim().toLowerCase() === blankAns
      correctAns = blankAns
    } else if (qtype === 'drag_into_text' || qtype === 'drag_into_groups') {
      const groups = q.drag_groups ?? []
      if (groups.length > 0) {
        const userGroups: Record<string, string[]> =
          typeof userAnsRaw === 'object' && userAnsRaw !== null && !Array.isArray(userAnsRaw)
            ? (userAnsRaw as Record<string, string[]>)
            : {}
        isCorrect = groups.every((group, gi) => {
          const expected = [...(group.answers ?? [])].sort()
          const actual = [...(userGroups[String(gi)] ?? [])].sort()
          return JSON.stringify(expected) === JSON.stringify(actual)
        })
        correctAns = groups.map((g) => (g.answers ?? []).join('|')).join(';')
        if (isCorrect) correct++
        results.push({ index: i, type: qtype, correct: isCorrect, user_answer: userAnsRaw, correct_answer: correctAns })
        continue
      }
      const sentences = q.drag_sentences ?? []
      if (sentences.length > 1) {
        const userSentences: Record<string, string> =
          typeof userAnsRaw === 'object' && userAnsRaw !== null && !Array.isArray(userAnsRaw)
            ? (userAnsRaw as Record<string, string>)
            : {}
        isCorrect =
          sentences.length > 0 &&
          sentences.every((sent, si) =>
            String(userSentences[String(si)] ?? '').trim().toLowerCase() ===
            String(sent.answer ?? '').trim().toLowerCase()
          )
        correctAns = sentences.map((s) => s.answer ?? '').join(';')
      } else {
        const singleAns = sentences[0]?.answer ?? ''
        correctAns = singleAns
        isCorrect = String(userAnsRaw).trim().toLowerCase() === singleAns.toLowerCase()
      }
    }

    if (isCorrect) correct++
    results.push({ index: i, type: qtype, correct: isCorrect, user_answer: userAnsRaw, correct_answer: correctAns })
  }

  const score = total > 0 ? Math.round((correct / total) * 10 * 10) / 10 : 0
  return { results, correct, total, score }
}
