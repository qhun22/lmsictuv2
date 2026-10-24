// Port từ django/lmsictu/word_parser.py
// Parse file .docx trắc nghiệm → danh sách câu hỏi JSON
// Dùng thư viện 'docx-wasm' hoặc 'mammoth' trong Workers environment
// Vì Workers không có filesystem, nhận ArrayBuffer/Uint8Array

// ── Regex patterns ──
const RE_QUESTION_START = /^\s*(?:câu|question|cau|q)\s*[:.?]?\s*(\d+)\s*[:.)\-]?\s*(.*)$/i
const RE_OPTION = /^\s*([A-Ha-h])[.):\-\s]\s*(.+?)\s*$/
const RE_ANSWER_LINE = /^\s*(?:đáp án|đa|answer|đáp án đúng|the correct answer)\s*[:.?]?\s*([A-Ha-h])\b/i
const RE_CORRECT_PREFIX = /^\s*[*✓✔✓✔]\s*([A-Ha-h])[.):\-\s]\s*(.+?)\s*$/
const RE_TRUE_FALSE = /(?:đúng\s*(?:hay|hoặc|hay\s+là)?\s*sai|true\s*or\s*false|đúng\s+không\s*\?|đúng\s*\?|sai\s*\?)/i
const RE_ORDERING = /(?:sắp\s*xếp\s*(?:lại\s*)?(?:câu|các\s*từ|các\s*đáp\s*án|cho\s*đúng)(?:\s+sau)?(?:\s+sao\s*cho\s*đúng(?:\s+cấu\s*trúc)?|\s+theo\s*đúng\s*thứ\s*tự|\s+cho\s*đúng|\s+cấu\s*trúc)?|rearrange(?:\s+the\s*sentence)?|reorder(?:\s+the\s*words?)|sắp\s*xếp\s*theo)/i
const RE_FILL_BLANK = /(?:điền\s*từ\s*(?:thích\s*hợp\s*)?(?:vào\s*)?(?:chỗ\s*trống|chỗ\s*trống\s*sau|vào\s*chỗ|khoảng\s*trống)(?:\s+sau)?|fill\s*in(?:\s*the\s*blank)?|điền\s*vào\s*chỗ\s*trống)/i
const RE_DRAG_INTO_TEXT = /(?:kéo|éo\s*thả|thả|drag\s*and\s*drop|điền\s+(?:các\s+)?đáp\s*án\s+(?:vào|khớp)|nối\s+(?:các\s+)?đáp\s*án)/i
const RE_BLANK_PLACEHOLDER = /_{3,}|\[\s*\]|\(\s*\)|…+|\.\.\.+/
const RE_ORDERING_ANSWER = /^\s*\*\*(.+)$/
const RE_ORDERING_WORDS = /^\s*(?!\*\*)[*•·›–\-]\s*(.+)$/
const RE_FILL_ANSWER = /^\s*[*•·›–\-]\s*(?![A-Ha-h][.)])(. +?)\s*$/

const QUESTION_TYPES: Record<string, string> = {
  single_choice: '1 đáp án đúng',
  multiple_response: 'Nhiều đáp án đúng',
  true_false: 'Đúng / Sai',
  fill_in_blank: 'Điền từ vào chỗ trống',
  ordering: 'Sắp xếp từ',
  drag_into_text: 'Kéo thả đáp án',
  drag_into_groups: 'Kéo thả theo nhóm',
  unknown: 'Chưa xác định',
}

type Option = { label: string; text: string; correct: boolean }
type Statement = {
  text?: string
  answer?: string | null
  ordering_words?: string[]
  ordering_sequence?: string[]
}
type DragGroup = { label: string; answers: string[] }
type DragSentence = { text: string; answer?: string | null }

type QuestionDraft = {
  number: number
  text: string
  marker: string | null
  options: Option[]
  answer: string | null
  type: string
  type_label: string
  correct_options: Option[]
  is_true_false: boolean
  is_ordering: boolean
  is_fill_in_blank: boolean
  ordering_words: string[] | null
  ordering_sequence: string[] | null
  fill_blank_answer: string | null
  is_drag_into_text: boolean
  drag_answers: string[] | null
  drag_groups: DragGroup[]
  drag_sentences: DragSentence[] | null
  statements: Statement[]
}

type ParagraphAnalysis = {
  text: string
  red: boolean
  red_text: string
  first_red_label: string | null
}

// ── Helpers ──

function isRed(r: number, g: number, b: number): boolean {
  return r >= 180 && g <= 100 && b <= 100
}

function splitMarker(text: string, pattern: RegExp): [string, string] {
  const m = pattern.exec(text)
  if (!m) return ['', text]
  const markerEnd = m.index + m[0].length
  const suffix = text.slice(markerEnd)
  for (let i = 0; i < suffix.length; i++) {
    if ('.!?'.includes(suffix[i])) {
      return [text.slice(0, markerEnd + i + 1).trim(), text.slice(markerEnd + i + 1).trim()]
    }
  }
  return [text.slice(0, markerEnd).trim(), text.slice(markerEnd).trim()]
}

function splitMarkerDrag(text: string, pattern: RegExp): [string, string] {
  const m = pattern.exec(text)
  if (!m) return ['', text]
  const markerEnd = m.index + m[0].length
  for (let i = markerEnd; i < text.length; i++) {
    if ('.!?;:'.includes(text[i])) {
      return [text.slice(0, i + 1).trim(), text.slice(i + 1).trim()]
    }
  }
  return [text.trim(), '']
}

function parseOptionLine(analysis: ParagraphAnalysis): Option | null {
  const text = analysis.text.trim()
  if (!text) return null

  if (analysis.first_red_label) {
    const m = RE_OPTION.exec(text)
    if (m) return { label: analysis.first_red_label, text: m[2].trim(), correct: true }
  }

  let m = RE_CORRECT_PREFIX.exec(text)
  if (m) return { label: m[1].toUpperCase(), text: m[2].trim(), correct: true }

  m = RE_OPTION.exec(text)
  if (m) return { label: m[1].toUpperCase(), text: m[2].trim(), correct: false }

  return null
}

function isTrueFalsePair(options: Option[]): boolean {
  if (options.length !== 2) return false
  const labels = options.map((o) => o.label.toUpperCase())
  const texts = options.map((o) => o.text.toLowerCase()).join(' ')
  return (
    JSON.stringify(labels) === JSON.stringify(['A', 'B']) &&
    ((texts.includes('đúng') && texts.includes('sai')) ||
      (texts.includes('true') && texts.includes('false')))
  )
}

function ensureSpecialFlags(current: QuestionDraft): void {
  if (!current.text) return
  const text = current.text
  if (!current.is_ordering && RE_ORDERING.test(text)) current.is_ordering = true
  if (!current.is_fill_in_blank && RE_FILL_BLANK.test(text)) current.is_fill_in_blank = true
  if (!current.is_drag_into_text && RE_DRAG_INTO_TEXT.test(text)) current.is_drag_into_text = true
  if (!current.is_true_false && RE_TRUE_FALSE.test(text)) current.is_true_false = true

  if (!current.marker) {
    let [marker, body] = splitMarker(text, RE_FILL_BLANK)
    if (marker) { current.marker = marker; current.text = body; return }
    ;[marker, body] = splitMarker(text, RE_ORDERING)
    if (marker) { current.marker = marker; current.text = body }
  }
}

function classifyQuestion(current: QuestionDraft): [string, string, Option[]] {
  const text = current.text ?? ''
  const options = current.options

  if (current.is_true_false) return ['true_false', QUESTION_TYPES.true_false, options.filter((o) => o.correct)]
  if (current.is_ordering) return ['ordering', QUESTION_TYPES.ordering, []]
  if (current.is_fill_in_blank) return ['fill_in_blank', QUESTION_TYPES.fill_in_blank, []]
  if (current.is_drag_into_text) return ['drag_into_text', QUESTION_TYPES.drag_into_text, []]

  if (RE_TRUE_FALSE.test(text)) return ['true_false', QUESTION_TYPES.true_false, options.filter((o) => o.correct)]
  if (RE_ORDERING.test(text)) return ['ordering', QUESTION_TYPES.ordering, []]
  if (RE_FILL_BLANK.test(text)) return ['fill_in_blank', QUESTION_TYPES.fill_in_blank, []]
  if (RE_DRAG_INTO_TEXT.test(text)) return ['drag_into_text', QUESTION_TYPES.drag_into_text, []]

  if (options.length === 2) {
    const texts = options.map((o) => o.text.toLowerCase()).join(' ')
    if ((texts.includes('đúng') && texts.includes('sai')) || (texts.includes('true') && texts.includes('false'))) {
      return ['true_false', QUESTION_TYPES.true_false, options.filter((o) => o.correct)]
    }
  }

  if (RE_BLANK_PLACEHOLDER.test(text)) return ['fill_in_blank', QUESTION_TYPES.fill_in_blank, []]

  const correctOpts = options.filter((o) => o.correct)
  if (correctOpts.length === 1) return ['single_choice', QUESTION_TYPES.single_choice, correctOpts]
  if (correctOpts.length >= 2) return ['multiple_response', QUESTION_TYPES.multiple_response, correctOpts]
  return ['unknown', QUESTION_TYPES.unknown, correctOpts]
}

// ── Hàm phân tích paragraph từ XML docx ──
// Input: mảng { text, rgbColors } đã extract từ OOXML
// rgbColors là array {r,g,b} cho mỗi run

export type RawParagraph = {
  text: string
  runs: Array<{ text: string; r?: number; g?: number; b?: number }>
}

function analyzeParagraph(p: RawParagraph): ParagraphAnalysis {
  // Normalize Unicode tương tự Python NFC + strip zero-width
  const fullText = p.text.replace(/[​-‍⁠﻿]/g, '')
  let hasRed = false
  const redParts: string[] = []
  let firstRedLabel: string | null = null

  const optionMatch = RE_OPTION.exec(fullText.trim())
  if (optionMatch) {
    const labelChar = optionMatch[1].toUpperCase()
    const labelEndPos = optionMatch[1].length
    let consumed = 0
    for (const run of p.runs) {
      if (!run.text) continue
      const runEnd = consumed + run.text.length
      if (runEnd > 0 && consumed < labelEndPos && run.r !== undefined && isRed(run.r, run.g ?? 0, run.b ?? 0)) {
        firstRedLabel = labelChar
        break
      }
      consumed = runEnd
    }
  }

  for (const run of p.runs) {
    if (run.r !== undefined && isRed(run.r, run.g ?? 0, run.b ?? 0)) {
      hasRed = true
      if (run.text) redParts.push(run.text)
    }
  }

  return { text: fullText, red: hasRed, red_text: redParts.join('').trim(), first_red_label: firstRedLabel }
}

// ── Parse từ mảng paragraphs (sau khi extract từ docx) ──
export function parseDocxQuestions(paragraphs: RawParagraph[]): {
  success: boolean
  questions: QuestionDraft[]
  warnings: string[]
  error?: string
} {
  const warnings: string[] = []

  // Expand paragraphs có \n
  const paragraphsData: ParagraphAnalysis[] = []
  for (const p of paragraphs) {
    if (p.text.includes('\n')) {
      const base = analyzeParagraph(p)
      for (const line of p.text.split('\n')) {
        if (!line.trim()) continue
        paragraphsData.push({ text: line, red: base.red, red_text: base.red_text, first_red_label: base.first_red_label })
      }
    } else {
      const analysis = analyzeParagraph(p)
      if (!analysis.text.trim()) continue
      paragraphsData.push(analysis)
    }
  }

  const questions: QuestionDraft[] = []
  let current: QuestionDraft | null = null
  let pendingLabel: string | null = null

  function newDraft(number: number, text: string): QuestionDraft {
    return {
      number,
      text,
      marker: null,
      options: [],
      answer: null,
      type: 'unknown',
      type_label: QUESTION_TYPES.unknown,
      correct_options: [],
      is_true_false: RE_TRUE_FALSE.test(text),
      is_ordering: RE_ORDERING.test(text),
      is_fill_in_blank: RE_FILL_BLANK.test(text),
      ordering_words: null,
      ordering_sequence: null,
      fill_blank_answer: null,
      is_drag_into_text: false,
      drag_answers: null,
      drag_groups: [],
      drag_sentences: null,
      statements: [],
    }
  }

  function saveTrueFalseStatement(): boolean {
    if (!current || !current.text || !isTrueFalsePair(current.options)) return false
    const correct = current.options.find((o) => o.correct) ?? null
    current.statements.push({
      text: current.text.trim(),
      answer: correct ? (correct.label === 'A' ? 'true' : 'false') : null,
    })
    current.text = ''
    current.options = []
    current.answer = null
    return true
  }

  function saveOrderingStatement(): boolean {
    if (!current || !current.ordering_words || !current.ordering_sequence) return false
    current.statements.push({
      ordering_words: [...current.ordering_words],
      ordering_sequence: [...current.ordering_sequence],
    })
    current.ordering_words = null
    current.ordering_sequence = null
    return true
  }

  function commitCurrent(): void {
    if (!current) return

    if (pendingLabel && current.options.length > 0) {
      const opt = current.options.find((o) => o.label === pendingLabel)
      if (opt) { opt.correct = true }
      current.answer = pendingLabel
    } else if (current.options.some((o) => o.correct)) {
      current.answer = current.options.find((o) => o.correct)?.label ?? null
    }

    if (current.statements.length > 0 && current.text && current.options.length > 0) {
      saveTrueFalseStatement()
      if (current.statements[0].text) current.text = current.statements[0].text
    }

    if (current.is_ordering && current.ordering_words && current.ordering_sequence) {
      saveOrderingStatement()
    }

    // Tách * / ** lẫn trong body
    if (current.text) {
      let textBody = current.text

      const seqMatches = [...textBody.matchAll(/(?:^|\s)\*\*(\S+)/g)]
      if (seqMatches.length > 0) {
        const last = seqMatches[seqMatches.length - 1]
        current.ordering_sequence = last[1].split('|').map((w) => w.trim()).filter(Boolean)
        textBody = (textBody.slice(0, last.index!) + textBody.slice(last.index! + last[0].length)).trim()
      }

      const wordsMatches = [...textBody.matchAll(/(?:^|\s)\*(?!\*)(\S+(?:\s+\S+)*)/g)]
      if (wordsMatches.length > 0) {
        const last = wordsMatches[wordsMatches.length - 1]
        const raw = last[1]
        if (raw.includes('|') || raw.includes(' ')) {
          current.ordering_words = raw.split('|').map((w) => w.trim()).filter(Boolean)
          textBody = (textBody.slice(0, last.index!) + textBody.slice(last.index! + last[0].length)).trim()
        }
      }

      const fillMatches = [...textBody.matchAll(/(?:^|\s)\*(?!\*)(?![A-Ha-h][.)])([^|*]+(?:\s+[^|*]+)*)/g)]
      if (fillMatches.length > 0 && !current.fill_blank_answer) {
        const last = fillMatches[fillMatches.length - 1]
        const ans = last[1].trim()
        if (!current.ordering_words || !current.ordering_words.includes(ans.split('|')[0].trim())) {
          current.fill_blank_answer = ans
          textBody = (textBody.slice(0, last.index!) + textBody.slice(last.index! + last[0].length)).trim()
        }
      }

      textBody = textBody.replace(/^[:.\\s]+/, '').trim()
      current.text = textBody
    }

    // DRAG_INTO_TEXT: extract marker + phân loại sentences/answers
    if (current.is_drag_into_text) {
      const combined = (current.text ?? '') + '\n' + (current.marker ?? '')
      if (combined.trim()) {
        const [markerFixed, bodyFixed] = splitMarkerDrag(combined.trim(), RE_DRAG_INTO_TEXT)
        const linesAll = (bodyFixed ?? '').split('\n')
        const introParts: string[] = []
        for (const bline of linesAll) {
          const bl = bline.trim()
          if (!bl) continue
          if (bl.startsWith('*') || /^\s*[*•·›–\-]\s*(.+)/.test(bl)) {
            const ansText = bl.replace(/^\s*[*•·›–\-]\s*/, '').trim()
            if (!current.drag_answers) current.drag_answers = []
            if (!current.drag_answers.includes(ansText)) current.drag_answers.push(ansText)
            continue
          }
          if (bl.includes('___')) {
            if (!current.drag_sentences) current.drag_sentences = []
            current.drag_sentences.push({ text: bl })
            continue
          }
          introParts.push(bl)
        }
        current.marker = markerFixed
        current.text = introParts.join('\n').trim()
      }
    }

    // Match answers to drag_sentences (reversed order)
    if (current.is_drag_into_text) {
      const ans = current.drag_answers ?? []
      const sents = current.drag_sentences ?? []
      if (sents.length > 0 && ans.length > 0) {
        sents.forEach((sent, i) => {
          const ansIdx = ans.length - 1 - i
          sent.answer = ansIdx >= 0 ? ans[ansIdx] : null
        })
        current.drag_answers = [...ans].reverse()
        current.text = ''
      }
    }

    // Phân loại
    const [qtype, qlabel, qcorrect] = classifyQuestion(current)
    if (qtype === 'drag_into_text' && current.drag_groups.length > 0) {
      current.type = 'drag_into_groups'
      current.type_label = 'Kéo thả theo nhóm'
      if (!current.text) current.text = 'Phân chia đáp án vào nhóm phù hợp.'
    } else {
      current.type = qtype
      current.type_label = qlabel
    }
    current.correct_options = qcorrect
    if (qtype === 'ordering' && !current.text) current.text = 'Sắp xếp lại câu sau sao cho đúng cấu trúc.'
    if (qtype === 'true_false' && current.statements.length > 0) current.text = 'Chọn đáp án Đúng Sai phù hợp.'

    questions.push(current)
    current = null
  }

  for (const analysis of paragraphsData) {
    const line = analysis.text

    // 1. Dòng "Đáp án: B"
    const ansMatch = RE_ANSWER_LINE.exec(line)
    if (ansMatch) {
      const label = ansMatch[1].toUpperCase()
      if (current && current.options.length > 0) {
        const opt = current.options.find((o) => o.label === label)
        if (opt) opt.correct = true
        current.answer = label
        commitCurrent()
        pendingLabel = null
      } else {
        pendingLabel = label
      }
      continue
    }

    // 2. Dòng bắt đầu câu hỏi
    const qMatch = RE_QUESTION_START.exec(line)
    if (qMatch) {
      commitCurrent()
      current = newDraft(parseInt(qMatch[1], 10), qMatch[2].trim())
      continue
    }

    if (!current) continue

    // ORDERING
    if (current.is_ordering) {
      const ordAns = RE_ORDERING_ANSWER.exec(line)
      const ordWords = RE_ORDERING_WORDS.exec(line)
      if (ordAns) {
        current.ordering_sequence = ordAns[1].split('|').map((w) => w.trim()).filter(Boolean)
        continue
      }
      if (ordWords) {
        if (current.ordering_words && current.ordering_sequence) saveOrderingStatement()
        current.ordering_words = ordWords[1].split('|').map((w) => w.trim()).filter(Boolean)
        continue
      }
      if (current.text && !current.ordering_words && !current.ordering_sequence) {
        current.text += ' ' + line
      }
      continue
    }

    // FILL_IN_BLANK
    if (current.is_fill_in_blank) {
      const fillMatch = RE_FILL_ANSWER.exec(line)
      if (fillMatch) {
        current.fill_blank_answer = fillMatch[1].trim()
        continue
      }
      current.text = current.text ? current.text + ' ' + line : line
      continue
    }

    // DRAG_INTO_TEXT
    if (current.is_drag_into_text) {
      const groupHeader = RE_ORDERING_ANSWER.exec(line)
      if (groupHeader) {
        current.drag_groups.push({ label: groupHeader[1].trim(), answers: [] })
        continue
      }
      const dragOpt = RE_ORDERING_WORDS.exec(line)
      if (dragOpt) {
        if (!current.drag_answers) current.drag_answers = []
        const ansText = dragOpt[1].trim()
        if (!current.drag_answers.includes(ansText)) current.drag_answers.push(ansText)
        if (current.drag_groups.length > 0) current.drag_groups[current.drag_groups.length - 1].answers.push(ansText)
        continue
      }
      if (line.includes('___')) {
        if (!current.drag_sentences) current.drag_sentences = []
        current.drag_sentences.push({ text: line })
        continue
      }
      current.text = current.text ? current.text + ' ' + line : line
      continue
    }

    // TRUE_FALSE: mệnh đề liên tiếp
    if (current.is_true_false && isTrueFalsePair(current.options)) {
      if (!parseOptionLine(analysis)) {
        saveTrueFalseStatement()
        current.text = line.trim()
        continue
      }
    }

    // Chưa có options → ghép text hoặc bắt đầu option
    if (current.options.length === 0) {
      const opt = parseOptionLine(analysis)
      if (opt) {
        current.options.push(opt)
      } else {
        current.text = current.text ? current.text + ' ' + line : line
        ensureSpecialFlags(current)
      }
      continue
    }

    // Đã có options → tiếp tục
    const opt = parseOptionLine(analysis)
    if (opt) {
      current.options.push(opt)
    } else if (current.options.length > 0) {
      const last = current.options[current.options.length - 1]
      last.text += ' ' + line
      if (analysis.red) last.correct = true
    }
  }

  commitCurrent()

  // Warnings
  for (const q of questions) {
    const qtype = q.type
    if (qtype === 'true_false' && q.statements.length > 0) {
      if (q.statements.some((s) => s.answer !== 'true' && s.answer !== 'false'))
        warnings.push(`Câu ${q.number}: có mệnh đề Đúng/Sai chưa xác định đáp án`)
      continue
    }
    if (qtype === 'ordering' || qtype === 'fill_in_blank') {
      if (q.is_ordering) {
        if (q.statements.length > 0) {
          q.statements.forEach((s, si) => {
            if (!s.ordering_words && !s.ordering_sequence)
              warnings.push(`Câu ${q.number}, mệnh đề ${si + 1}: thiếu từ lộn xộn và thứ tự đúng`)
            else if (!s.ordering_words)
              warnings.push(`Câu ${q.number}, mệnh đề ${si + 1}: thiếu dãy từ lộn xộn (*)`)
            else if (!s.ordering_sequence)
              warnings.push(`Câu ${q.number}, mệnh đề ${si + 1}: thiếu đáp án thứ tự (**)`)
          })
        } else {
          if (!q.ordering_words && !q.ordering_sequence)
            warnings.push(`Câu ${q.number}: thiếu cả dãy từ lộn xộn (*) lẫn đáp án (**)`)
          else if (!q.ordering_words)
            warnings.push(`Câu ${q.number}: thiếu dãy từ lộn xộn (*) — chỉ có dòng đáp án`)
          else if (!q.ordering_sequence)
            warnings.push(`Câu ${q.number}: thiếu đáp án (**) trong ordering`)
        }
      } else if (q.is_fill_in_blank && !q.fill_blank_answer) {
        warnings.push(`Câu ${q.number}: chưa xác định đáp án điền vào chỗ trống`)
      }
      continue
    }
    if (qtype === 'drag_into_text' || qtype === 'drag_into_groups') {
      if (q.drag_groups.length > 0) {
        if (q.drag_groups.some((g) => !g.label || !g.answers.length))
          warnings.push(`Câu ${q.number}: có nhóm kéo thả chưa có tên hoặc đáp án`)
        continue
      }
      const sents = q.drag_sentences ?? []
      const ans = q.drag_answers ?? []
      if (!sents.length && !ans.length) warnings.push(`Câu ${q.number}: thiếu cả câu có ___ lẫn đáp án (*) cho dạng kéo thả`)
      else if (!sents.length) warnings.push(`Câu ${q.number}: thiếu câu có ___ (ký hiệu chỗ trống) cho dạng kéo thả`)
      else if (!ans.length) warnings.push(`Câu ${q.number}: thiếu đáp án (*) cho dạng kéo thả`)
      else if (sents.length !== ans.length) warnings.push(`Câu ${q.number}: số câu (${sents.length}) không khớp số đáp án (${ans.length})`)
      continue
    }
    if (q.options.length < 2) warnings.push(`Câu ${q.number}: chỉ có ${q.options.length} đáp án`)
    if (!q.answer) warnings.push(`Câu ${q.number}: chưa xác định được đáp án đúng`)
  }

  return { success: true, questions, warnings }
}

// ── Extract paragraphs từ .docx ArrayBuffer ──
// Dùng DOMParser (available trong Workers) để parse XML
export async function extractParagraphsFromDocx(buffer: ArrayBuffer): Promise<RawParagraph[]> {
  // Unzip docx (zip format) để lấy word/document.xml
  // Trong Cloudflare Workers dùng DecompressionStream + manual ZIP parsing
  // Hoặc dùng thư viện: fflate (lightweight, wasm-free)
  // TODO: install 'fflate' → npm install fflate
  // import { unzipSync } from 'fflate'
  // const unzipped = unzipSync(new Uint8Array(buffer))
  // const xmlBytes = unzipped['word/document.xml']
  // const xmlStr = new TextDecoder().decode(xmlBytes)
  // return parseWordXml(xmlStr)
  throw new Error('extractParagraphsFromDocx: cần install fflate → npm install fflate')
}

// Parse word/document.xml → RawParagraph[]
export function parseWordXml(xmlStr: string): RawParagraph[] {
  // Dùng regex-based parser (Workers không có full DOM)
  // Mỗi <w:p>...</w:p> là 1 paragraph
  // Mỗi <w:r>...</w:r> là 1 run
  // <w:t>text</w:t> là text content
  // <w:color w:val="FF0000"/> là màu

  const paragraphs: RawParagraph[] = []
  const pMatches = xmlStr.matchAll(/<w:p[ >]([\s\S]*?)<\/w:p>/g)

  for (const pMatch of pMatches) {
    const pXml = pMatch[1]
    const runs: RawParagraph['runs'] = []
    const rMatches = pXml.matchAll(/<w:r[ >]([\s\S]*?)<\/w:r>/g)

    for (const rMatch of rMatches) {
      const rXml = rMatch[1]
      const textMatch = /<w:t[^>]*>([\s\S]*?)<\/w:t>/.exec(rXml)
      const runText = textMatch ? textMatch[1] : ''
      const colorMatch = /<w:color\s+w:val="([0-9A-Fa-f]{6})"/.exec(rXml)
      let r: number | undefined, g: number | undefined, b: number | undefined
      if (colorMatch) {
        const hex = colorMatch[1]
        r = parseInt(hex.slice(0, 2), 16)
        g = parseInt(hex.slice(2, 4), 16)
        b = parseInt(hex.slice(4, 6), 16)
      }
      runs.push({ text: runText, r, g, b })
    }

    const fullText = runs.map((run) => run.text).join('')
    paragraphs.push({ text: fullText, runs })
  }

  return paragraphs
}
