// Port từ django/lmsictu/views.py: api_subjects, api_subject_create, api_subject_delete, api_subject_rename

import { Hono } from 'hono'
import type { Env } from '../index'
import { getSession } from '../utils/auth'

export const subjectRoutes = new Hono<{ Bindings: Env }>()

// GET /api/subjects
subjectRoutes.get('/subjects', async (c) => {
  const session = await getSession(c)
  if (!session) return c.json({ success: false, message: 'Chưa đăng nhập.' }, 401)

  const { results } = await c.env.DB.prepare(
    'SELECT id, name, created_at FROM subject WHERE creator_id = ? ORDER BY name'
  ).bind(session.userId).all<{ id: number; name: string; created_at: string }>()

  return c.json({ subjects: results })
})

// POST /api/subject/create
subjectRoutes.post('/subject/create', async (c) => {
  const session = await getSession(c)
  if (!session) return c.json({ success: false, message: 'Chưa đăng nhập.' }, 401)

  let data: { name?: string }
  try { data = await c.req.json() } catch { return c.json({ success: false, message: 'Dữ liệu không hợp lệ.' }, 400) }

  const name = data.name?.trim() ?? ''
  if (!name) return c.json({ success: false, message: 'Tên môn học không được trống.' }, 400)

  const exists = await c.env.DB.prepare(
    'SELECT id FROM subject WHERE LOWER(name) = LOWER(?) AND creator_id = ?'
  ).bind(name, session.userId).first()
  if (exists) return c.json({ success: false, message: 'Môn học đã tồn tại.' }, 400)

  const result = await c.env.DB.prepare(
    'INSERT INTO subject (name, creator_id) VALUES (?, ?) RETURNING id, name'
  ).bind(name, session.userId).first<{ id: number; name: string }>()

  return c.json({ success: true, subject: result })
})

// POST /api/subject/:id (xóa môn học)
subjectRoutes.post('/subject/:id', async (c) => {
  const session = await getSession(c)
  if (!session) return c.json({ success: false, message: 'Chưa đăng nhập.' }, 401)

  const id = Number(c.req.param('id'))
  const subject = await c.env.DB.prepare('SELECT id FROM subject WHERE id = ? AND creator_id = ?')
    .bind(id, session.userId).first()
  if (!subject) return c.json({ success: false, message: 'Không tìm thấy môn học.' }, 404)

  await c.env.DB.prepare('DELETE FROM subject WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// POST /api/subject/:id/rename
subjectRoutes.post('/subject/:id/rename', async (c) => {
  const session = await getSession(c)
  if (!session) return c.json({ success: false, message: 'Chưa đăng nhập.' }, 401)

  const id = Number(c.req.param('id'))
  let data: { name?: string }
  try { data = await c.req.json() } catch { return c.json({ success: false, message: 'Dữ liệu không hợp lệ.' }, 400) }

  const newName = data.name?.trim() ?? ''
  if (!newName) return c.json({ success: false, message: 'Tên môn học không được trống.' }, 400)

  const subject = await c.env.DB.prepare('SELECT id FROM subject WHERE id = ? AND creator_id = ?')
    .bind(id, session.userId).first()
  if (!subject) return c.json({ success: false, message: 'Không tìm thấy môn học.' }, 404)

  const duplicate = await c.env.DB.prepare(
    'SELECT id FROM subject WHERE LOWER(name) = LOWER(?) AND creator_id = ? AND id != ?'
  ).bind(newName, session.userId, id).first()
  if (duplicate) return c.json({ success: false, message: 'Tên môn học đã tồn tại.' }, 400)

  await c.env.DB.prepare('UPDATE subject SET name = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .bind(newName, id).run()

  return c.json({ success: true, name: newName })
})
