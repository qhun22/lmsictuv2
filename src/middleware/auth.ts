// Middleware auth toàn app — tương đương @login_required của Django
// Các route public: không cần check; còn lại redirect /login nếu chưa đăng nhập

import { createMiddleware } from 'hono/factory'
import type { Env } from '../index'
import { getSession } from '../utils/auth'

const PUBLIC_PATHS = new Set(['/', '/login', '/register', '/forgot-password'])

export const authMiddleware = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const path = new URL(c.req.url).pathname

  // Route công khai — cho qua luôn
  if (
    PUBLIC_PATHS.has(path) ||
    path.startsWith('/e/') ||
    path.startsWith('/result/') ||
    path.startsWith('/assets/') ||
    path === '/api/submit-exam' ||
    path.startsWith('/api/submit-exam/')
  ) {
    return next()
  }

  // Với các route cần đăng nhập, lưu session vào context để dùng trong route handler
  const session = await getSession(c)
  if (session) {
    c.set('user' as never, session)
  }
  // Redirect được xử lý trong từng route handler (không redirect global để tránh phá API routes)
  return next()
})
