// Port từ django/lmsictu/views.py: api_parse_word, api_save_quiz, api_quiz_links,
// api_update_quiz, api_quiz_detail, api_exam_access, api_toggle_quiz, api_delete_quiz

import { Hono } from 'hono'
import type { Env } from '../index'
import { getSession, quizUserHasAccess } from '../utils/auth'
import { parseDocxQuestions, parseWordXml } from '../utils/word-parser'

export const quizRoutes = new Hono<{ Bindings: Env }>()

type QuizRow = {
  id: number; code: string; title: string; subject: string; week_index: number | null
  is_active: number; creator_id: number; questions: string; duration_seconds: number
  has_key_username: number; key_usernames: string; created_at: string
}

// ── POST /api/parse-word ──
// Nhận file .docx, parse câu hỏi → JSON (tương đương api_parse_word)
quizRoutes.post('/parse-word', async (c) => {
  const session = await getSession(c)
  if (!session) return c.json({ success: false, error: 'Chưa đăng nhập.' }, 401)

  const contentType = c.req.header('content-type') ?? ''
  if (!contentType.includes('multipart/form-data')) {
    return c.json({ success: false, error: 'Cần gửi multipart/form-data.' }, 400)
  }

  const formData = await c.req.formData()
  const file = formData.get('file')
  if (!file || typeof file === 'string') return c.json({ success: false, error: 'Không có file.' }, 400)

  const name = (file as File).name?.toLowerCase() ?? ''
  if (!name.endsWith('.docx')) return c.json({ success: false, error: 'Chỉ hỗ trợ file .docx.' }, 400)
  if ((file as File).size > 20 * 1024 * 1024) return c.json({ success: false, error: 'File quá lớn (tối đa 20MB).' }, 400)

  try {
    const buffer = await (file as File).arrayBuffer()
    // Dùng fflate để unzip docx → lấy word/document.xml
    // import { unzipSync } from 'fflate' (thêm vào package.json)
    const { unzipSync } = await import('fflate')
    const unzipped = unzipSync(new Uint8Array(buffer))
    const xmlBytes = unzipped['word/document.xml']
    if (!xmlBytes) return c.json({ success: false, error: 'Không đọc được nội dung file Word.' }, 400)
    const xmlStr = new TextDecoder().decode(xmlBytes)
    const paragraphs = parseWordXml(xmlStr)
    const result = parseDocxQuestions(paragraphs)
    return c.json(result)
  } catch (e) {
    return c.json({ success: false, error: `Lỗi parse: ${e}` }, 500)
  }
})

// ── POST /api/save-quiz ──
quizRoutes.post('/save-quiz', async (c) => {
  const session = await getSession(c)
  if (!session) return c.json({ success: false, message: 'Chưa đăng nhập.' }, 401)

  let data: { questions?: unknown[]; subject?: string; title?: string; duration_seconds?: number; week_index?: string | number | null }
  try { data = await c.req.json() } catch { return c.json({ success: false, message: 'Dữ liệu không hợp lệ.' }, 400) }

  const { questions = [], subject = '', title = '' } = data
  if (!questions.length) return c.json({ success: false, message: 'Không có câu hỏi nào.' }, 400)

  const dur = Number(data.duration_seconds ?? 1800)
  if (dur < 60 || dur > 86400) return c.json({ success: false, message: 'Thời gian làm bài phải từ 01:00 đến 24:00:00.' }, 400)

  const weekIdx = data.week_index !== null && data.week_index !== '' ? Number(data.week_index) : null

  // Kiểm tra duplicate subject+week_index
  if (subject && weekIdx !== null) {
    const existing = await c.env.DB.prepare(
      'SELECT code FROM quiz WHERE creator_id = ? AND subject = ? AND week_index = ?'
    ).bind(session.userId, subject, weekIdx).first<{ code: string }>()
    if (existing) {
      return c.json({ success: false, message: 'Tuần học này đã có đề. Hãy chọn chỉnh sửa đề hiện tại.', code: existing.code }, 409)
    }
  }

  // Tạo code 8 ký tự hex
  const codeBytes = crypto.getRandomValues(new Uint8Array(4))
  const code = Array.from(codeBytes).map((b) => b.toString(16).padStart(2, '0')).join('')

  await c.env.DB.prepare(
    `INSERT INTO quiz (code, title, subject, week_index, is_active, creator_id, questions, duration_seconds)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?)`
  ).bind(code, title || `Đề ${subject}`, subject, weekIdx, session.userId, JSON.stringify(questions), dur).run()

  // Gán link vào Week nếu có subject + week_index
  if (subject && weekIdx !== null) {
    const origin = new URL(c.req.url).origin
    const link = `${origin}/e/${code}/`
    await c.env.DB.prepare(
      `UPDATE week SET link = ?, quiz_code = ?
       WHERE subject_id = (SELECT id FROM subject WHERE name = ? AND creator_id = ?)
       ORDER BY id LIMIT 1 OFFSET ?`
    ).bind(link, code, subject, session.userId, weekIdx).run()
  }

  const origin = new URL(c.req.url).origin
  return c.json({ success: true, code, link: `${origin}/e/${code}/` })
})

// ── GET /api/quiz-links ──
quizRoutes.get('/quiz-links', async (c) => {
  const session = await getSession(c)
  if (!session) return c.json({ success: false, message: 'Chưa đăng nhập.' }, 401)

  const { results } = await c.env.DB.prepare(
    'SELECT code, title, subject, week_index, is_active FROM quiz WHERE creator_id = ? AND week_index IS NOT NULL ORDER BY created_at DESC'
  ).bind(session.userId).all<Pick<QuizRow, 'code' | 'title' | 'subject' | 'week_index' | 'is_active'>>()

  const origin = new URL(c.req.url).origin
  return c.json({
    links: results.map((q) => ({
      subject: q.subject, week_index: q.week_index, code: q.code, title: q.title,
      is_active: Boolean(q.is_active), link: `${origin}/e/${q.code}/`,
    })),
  })
})

// ── GET /api/quiz/:code ──
quizRoutes.get('/quiz/:code', async (c) => {
  const session = await getSession(c)
  if (!session) return c.json({ success: false, message: 'Chưa đăng nhập.' }, 401)

  const code = c.req.param('code')
  const quiz = await c.env.DB.prepare('SELECT * FROM quiz WHERE code = ? AND creator_id = ?')
    .bind(code, session.userId).first<QuizRow>()
  if (!quiz) return c.json({ success: false, message: 'Không tìm thấy đề.' }, 404)

  return c.json({
    success: true, code: quiz.code, title: quiz.title, subject: quiz.subject,
    week_index: quiz.week_index, is_active: Boolean(quiz.is_active),
    duration_seconds: quiz.duration_seconds, has_key_username: Boolean(quiz.has_key_username),
    key_usernames: safeJson<string[]>(quiz.key_usernames, []),
    questions: safeJson(quiz.questions, []),
  })
})

// ── POST /api/quiz/:code/update ──
quizRoutes.post('/quiz/:code/update', async (c) => {
  const session = await getSession(c)
  if (!session) return c.json({ success: false, message: 'Chưa đăng nhập.' }, 401)

  const code = c.req.param('code')
  const quiz = await c.env.DB.prepare('SELECT * FROM quiz WHERE code = ? AND creator_id = ?')
    .bind(code, session.userId).first<QuizRow>()
  if (!quiz) return c.json({ success: false, message: 'Không tìm thấy đề.' }, 404)

  let data: Record<string, unknown>
  try { data = await c.req.json() } catch { return c.json({ success: false, message: 'Dữ liệu không hợp lệ.' }, 400) }

  const sets: string[] = []
  const vals: unknown[] = []

  if ('questions' in data) { sets.push('questions = ?'); vals.push(JSON.stringify(data.questions)) }
  if ('is_active' in data) { sets.push('is_active = ?'); vals.push(data.is_active ? 1 : 0) }
  if ('subject' in data) { sets.push('subject = ?'); vals.push(String(data.subject).trim()) }
  if ('week_index' in data) {
    const wi = data.week_index !== null && String(data.week_index).trim() !== '' ? Number(data.week_index) : null
    sets.push('week_index = ?'); vals.push(wi)
  }
  if ('title' in data) { sets.push('title = ?'); vals.push(String(data.title).trim()) }
  if ('duration_seconds' in data) {
    const dur = Number(data.duration_seconds)
    if (dur < 60 || dur > 86400) return c.json({ success: false, message: 'Thời gian làm bài phải từ 01:00 đến 24:00:00.' }, 400)
    sets.push('duration_seconds = ?'); vals.push(dur)
  }
  if ('has_key_username' in data) { sets.push('has_key_username = ?'); vals.push(data.has_key_username ? 1 : 0) }
  if ('key_usernames' in data) { sets.push('key_usernames = ?'); vals.push(JSON.stringify(data.key_usernames ?? [])) }

  if (sets.length > 0) {
    vals.push(code, session.userId)
    await c.env.DB.prepare(`UPDATE quiz SET ${sets.join(', ')} WHERE code = ? AND creator_id = ?`).bind(...vals).run()
  }

  // Cập nhật Week.link nếu có subject + week_index
  const newSubject = ('subject' in data ? String(data.subject).trim() : quiz.subject)
  const newWeekIdx = ('week_index' in data
    ? (data.week_index !== null && String(data.week_index).trim() !== '' ? Number(data.week_index) : null)
    : quiz.week_index)
  if (newSubject && newWeekIdx !== null) {
    const origin = new URL(c.req.url).origin
    await c.env.DB.prepare(
      `UPDATE week SET link = ?, quiz_code = ?
       WHERE subject_id = (SELECT id FROM subject WHERE name = ? AND creator_id = ?)
       ORDER BY id LIMIT 1 OFFSET ?`
    ).bind(`${origin}/e/${code}/`, code, newSubject, session.userId, newWeekIdx).run()
  }

  return c.json({ success: true })
})

// ── POST /api/quiz/:code/toggle ──
quizRoutes.post('/quiz/:code/toggle', async (c) => {
  const session = await getSession(c)
  if (!session) return c.json({ success: false, message: 'Chưa đăng nhập.' }, 401)

  const code = c.req.param('code')
  const quiz = await c.env.DB.prepare('SELECT id, is_active FROM quiz WHERE code = ? AND creator_id = ?')
    .bind(code, session.userId).first<{ id: number; is_active: number }>()
  if (!quiz) return c.json({ success: false, message: 'Không tìm thấy đề.' }, 404)

  const newActive = quiz.is_active ? 0 : 1
  await c.env.DB.prepare('UPDATE quiz SET is_active = ? WHERE id = ?').bind(newActive, quiz.id).run()
  return c.json({ success: true, is_active: Boolean(newActive) })
})

// ── POST /api/quiz/:code/delete ──
quizRoutes.post('/quiz/:code/delete', async (c) => {
  const session = await getSession(c)
  if (!session) return c.json({ success: false, message: 'Chưa đăng nhập.' }, 401)

  const code = c.req.param('code')
  const quiz = await c.env.DB.prepare('SELECT id FROM quiz WHERE code = ? AND creator_id = ?')
    .bind(code, session.userId).first<{ id: number }>()
  if (!quiz) return c.json({ success: false, message: 'Không tìm thấy đề.' }, 404)

  // Clear week link
  await c.env.DB.prepare(
    `UPDATE week SET link = '', quiz_code = ''
     WHERE quiz_code = ? AND subject_id IN (SELECT id FROM subject WHERE creator_id = ?)`
  ).bind(code, session.userId).run()

  await c.env.DB.prepare('DELETE FROM quiz WHERE id = ?').bind(quiz.id).run()
  return c.json({ success: true })
})

// ── GET /api/exam/:code/access ──
quizRoutes.get('/exam/:code/access', async (c) => {
  const session = await getSession(c)
  if (!session) return c.json({ success: false, allowed: false }, 401)

  const code = c.req.param('code')
  const quiz = await c.env.DB.prepare('SELECT is_active, has_key_username, key_usernames FROM quiz WHERE code = ?')
    .bind(code).first<{ is_active: number; has_key_username: number; key_usernames: string }>()
  if (!quiz) return c.json({ success: false, allowed: false }, 404)

  const allowed = Boolean(quiz.is_active) && quizUserHasAccess(quiz, session.username)
  return c.json({ success: true, allowed })
})

function safeJson<T>(str: string, fallback: T): T {
  try { return JSON.parse(str) } catch { return fallback }
}
