// Port từ django/lmsictu/views.py: api_weeks, api_week_create, api_week_update, api_week_delete, api_week_rename

import { Hono } from 'hono'
import type { Env } from '../index'
import { getSession } from '../utils/auth'

export const weekRoutes = new Hono<{ Bindings: Env }>()

type WeekRow = { id: number; name: string; topics: string; link: string; quiz_code: string; active: number }

// GET /api/subject/:id/weeks
weekRoutes.get('/subject/:id/weeks', async (c) => {
  const session = await getSession(c)
  if (!session) return c.json({ success: false, message: 'Chưa đăng nhập.' }, 401)

  const subjectId = Number(c.req.param('id'))
  const subject = await c.env.DB.prepare('SELECT id FROM subject WHERE id = ? AND creator_id = ?')
    .bind(subjectId, session.userId).first()
  if (!subject) return c.json({ success: false, message: 'Không tìm thấy môn học.' }, 404)

  const { results } = await c.env.DB.prepare(
    'SELECT id, name, topics, link, quiz_code, active FROM week WHERE subject_id = ? ORDER BY id'
  ).bind(subjectId).all<WeekRow>()

  return c.json({
    weeks: results.map((w) => ({
      ...w,
      topics: safeJson(w.topics, []),
      active: Boolean(w.active),
    })),
  })
})

// POST /api/subject/:id/week/create
weekRoutes.post('/subject/:id/week/create', async (c) => {
  const session = await getSession(c)
  if (!session) return c.json({ success: false, message: 'Chưa đăng nhập.' }, 401)

  const subjectId = Number(c.req.param('id'))
  let data: { name?: string; topics?: unknown[]; link?: string }
  try { data = await c.req.json() } catch { return c.json({ success: false, message: 'Dữ liệu không hợp lệ.' }, 400) }

  const name = data.name?.trim() ?? ''
  if (!name) return c.json({ success: false, message: 'Tên tuần không được trống.' }, 400)

  const subject = await c.env.DB.prepare('SELECT id FROM subject WHERE id = ? AND creator_id = ?')
    .bind(subjectId, session.userId).first()
  if (!subject) return c.json({ success: false, message: 'Không tìm thấy môn học.' }, 404)

  const topics = JSON.stringify(data.topics ?? [])
  const link = data.link?.trim() ?? ''

  const week = await c.env.DB.prepare(
    'INSERT INTO week (subject_id, name, topics, link) VALUES (?, ?, ?, ?) RETURNING id, name, topics, link, quiz_code, active'
  ).bind(subjectId, name, topics, link).first<WeekRow>()

  return c.json({
    success: true,
    week: { ...week!, topics: safeJson(week!.topics, []), active: Boolean(week!.active) },
  })
})

// POST /api/week/:id (update)
weekRoutes.post('/week/:id', async (c) => {
  const session = await getSession(c)
  if (!session) return c.json({ success: false, message: 'Chưa đăng nhập.' }, 401)

  const id = Number(c.req.param('id'))
  let data: { name?: string; topics?: unknown[]; link?: string }
  try { data = await c.req.json() } catch { return c.json({ success: false, message: 'Dữ liệu không hợp lệ.' }, 400) }

  const week = await c.env.DB.prepare(
    'SELECT w.id FROM week w JOIN subject s ON w.subject_id = s.id WHERE w.id = ? AND s.creator_id = ?'
  ).bind(id, session.userId).first()
  if (!week) return c.json({ success: false, message: 'Không tìm thấy tuần học.' }, 404)

  const sets: string[] = []
  const vals: unknown[] = []
  if (data.name !== undefined) { sets.push('name = ?'); vals.push(data.name.trim()) }
  if (data.topics !== undefined) { sets.push('topics = ?'); vals.push(JSON.stringify(data.topics)) }
  if (data.link !== undefined) { sets.push('link = ?'); vals.push(data.link.trim()) }

  if (sets.length > 0) {
    vals.push(id)
    await c.env.DB.prepare(`UPDATE week SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run()
  }

  return c.json({ success: true })
})

// POST /api/week/:id/delete
weekRoutes.post('/week/:id/delete', async (c) => {
  const session = await getSession(c)
  if (!session) return c.json({ success: false, message: 'Chưa đăng nhập.' }, 401)

  const id = Number(c.req.param('id'))
  const week = await c.env.DB.prepare(
    'SELECT w.id FROM week w JOIN subject s ON w.subject_id = s.id WHERE w.id = ? AND s.creator_id = ?'
  ).bind(id, session.userId).first()
  if (!week) return c.json({ success: false, message: 'Không tìm thấy tuần học.' }, 404)

  await c.env.DB.prepare('DELETE FROM week WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// POST /api/week/:id/rename
weekRoutes.post('/week/:id/rename', async (c) => {
  const session = await getSession(c)
  if (!session) return c.json({ success: false, message: 'Chưa đăng nhập.' }, 401)

  const id = Number(c.req.param('id'))
  let data: { name?: string }
  try { data = await c.req.json() } catch { return c.json({ success: false, message: 'Dữ liệu không hợp lệ.' }, 400) }

  const newName = data.name?.trim() ?? ''
  if (!newName) return c.json({ success: false, message: 'Tên tuần không được trống.' }, 400)

  const week = await c.env.DB.prepare(
    'SELECT w.id FROM week w JOIN subject s ON w.subject_id = s.id WHERE w.id = ? AND s.creator_id = ?'
  ).bind(id, session.userId).first()
  if (!week) return c.json({ success: false, message: 'Không tìm thấy tuần học.' }, 404)

  await c.env.DB.prepare('UPDATE week SET name = ? WHERE id = ?').bind(newName, id).run()
  return c.json({ success: true, name: newName })
})

function safeJson<T>(str: string, fallback: T): T {
  try { return JSON.parse(str) } catch { return fallback }
}
