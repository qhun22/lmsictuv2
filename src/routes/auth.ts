// Port từ django/lmsictu/views.py: login_view, register_view, forgot_password_view, logout_view, account_view

import { Hono } from 'hono'
import type { Env } from '../index'
import { getSession, setSession, clearSession, hashPassword, verifyPassword } from '../utils/auth'

export const authRoutes = new Hono<{ Bindings: Env }>()

// ── GET /login ──
authRoutes.get('/login', async (c) => {
  const session = await getSession(c)
  if (session) {
    const next = c.req.query('next') || '/home'
    return c.redirect(next)
  }
  const next = c.req.query('next') || ''
  return c.html(renderLogin({ next }))
})

// ── POST /login ──
authRoutes.post('/login', async (c) => {
  const body = await c.req.parseBody()
  const username = ((body['username'] as string) || '').trim().toLowerCase()
  const password = (body['password'] as string) || ''
  const nextUrl = (body['next'] as string) || c.req.query('next') || ''
  const isAjax = c.req.header('x-requested-with') === 'XMLHttpRequest'

  const fail = (msg: string) =>
    isAjax ? c.json({ success: false, message: msg }, 400) : c.html(renderLogin({ next: nextUrl, error: msg }))

  if (!username) return fail('Vui lòng nhập tên đăng nhập hoặc email.')
  if (!password) return fail('Vui lòng nhập mật khẩu.')

  // Tìm user theo username hoặc email (tương đương authenticate() của Django)
  let user = await c.env.DB.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1')
    .bind(username).first<{ id: number; username: string; email: string; password_hash: string }>()

  if (!user && username.includes('@')) {
    user = await c.env.DB.prepare('SELECT * FROM users WHERE LOWER(email) = ? AND is_active = 1')
      .bind(username).first()
  }

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return fail('Tên đăng nhập hoặc mật khẩu không đúng.')
  }

  const headers = new Headers()
  await setSession(c, { userId: user.id, username: user.username }, headers)

  const target = nextUrl?.startsWith('/') ? nextUrl : '/home'
  if (isAjax) {
    return new Response(JSON.stringify({ success: true, message: 'Đăng nhập thành công.', redirect: target }), {
      status: 200, headers: { ...Object.fromEntries(headers), 'Content-Type': 'application/json' },
    })
  }
  headers.set('Location', target)
  return new Response(null, { status: 302, headers })
})

// ── GET /register ──
authRoutes.get('/register', async (c) => {
  return c.html(renderRegister({ next: c.req.query('next') || '' }))
})

// ── POST /register ──
authRoutes.post('/register', async (c) => {
  const body = await c.req.parseBody()
  const username = ((body['username'] as string) || '').trim().toLowerCase()
  const email = ((body['email'] as string) || '').trim().toLowerCase()
  const password = (body['password'] as string) || ''
  const passwordConfirm = (body['password_confirm'] as string) || ''
  const nextUrl = (body['next'] as string) || ''
  const isAjax = c.req.header('x-requested-with') === 'XMLHttpRequest'

  const fail = (msg: string) =>
    isAjax ? c.json({ success: false, message: msg }, 400) : c.html(renderRegister({ next: nextUrl, error: msg }))

  if (!username) return fail('Vui lòng nhập tên đăng nhập.')
  if (username.length < 3) return fail('Tên đăng nhập phải có ít nhất 3 ký tự.')
  if (!email || !email.includes('@') || !email.split('@')[1]?.includes('.')) return fail('Email không hợp lệ.')
  if (!password) return fail('Vui lòng nhập mật khẩu.')
  if (password.length < 8) return fail('Mật khẩu phải có ít nhất 8 ký tự.')
  if (!passwordConfirm) return fail('Vui lòng nhập lại mật khẩu.')
  if (password !== passwordConfirm) return fail('Mật khẩu nhập lại không khớp.')

  const emailExists = await c.env.DB.prepare('SELECT id FROM users WHERE LOWER(email) = ?').bind(email).first()
  if (emailExists) return fail('Email này đã được sử dụng.')

  const userExists = await c.env.DB.prepare('SELECT id FROM users WHERE LOWER(username) = ?').bind(username).first()
  if (userExists) return fail('Tên đăng nhập này đã tồn tại.')

  const passwordHash = await hashPassword(password)
  await c.env.DB.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)')
    .bind(username, email, passwordHash).run()

  const loginUrl = nextUrl ? `/login?next=${encodeURIComponent(nextUrl)}` : '/login'
  if (isAjax) {
    return c.json({ success: true, message: 'Tài khoản đã được tạo thành công. Vui lòng đăng nhập.', redirect: loginUrl })
  }
  return c.redirect(loginUrl)
})

// ── GET /forgot-password ──
authRoutes.get('/forgot-password', async (c) => {
  return c.html(renderForgotPassword({}))
})

// ── POST /forgot-password ──
authRoutes.post('/forgot-password', async (c) => {
  const body = await c.req.parseBody()
  const identifier = ((body['identifier'] as string) || '').trim().toLowerCase()
  const isAjax = c.req.header('x-requested-with') === 'XMLHttpRequest'

  if (!identifier) {
    const msg = 'Vui lòng nhập email hoặc tên đăng nhập.'
    return isAjax ? c.json({ success: false, message: msg }, 400) : c.html(renderForgotPassword({ error: msg }))
  }

  // Không tiết lộ user có tồn tại hay không (security best practice)
  return isAjax
    ? c.json({ success: true, message: 'Nếu tài khoản tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi.' })
    : c.html(renderForgotPassword({ success: 'Nếu tài khoản tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi.' }))
})

// ── GET /logout + POST /logout ──
const logoutHandler = async (c: Context) => {
  const headers = new Headers()
  clearSession(headers)
  headers.set('Location', '/')
  return new Response(null, { status: 302, headers })
}
authRoutes.get('/logout', logoutHandler)
authRoutes.post('/logout', logoutHandler)

// ── GET /account ──
authRoutes.get('/account', async (c) => {
  const session = await getSession(c)
  if (!session) return c.redirect('/login?next=/account')
  const user = await c.env.DB.prepare('SELECT id, username, email FROM users WHERE id = ?')
    .bind(session.userId).first<{ id: number; username: string; email: string }>()
  if (!user) return c.redirect('/login')
  return c.html(renderAccount({ user }))
})

// ── POST /account (đổi mật khẩu) ──
authRoutes.post('/account', async (c) => {
  const session = await getSession(c)
  if (!session) return c.redirect('/login?next=/account')

  const body = await c.req.parseBody()
  const oldPassword = (body['old_password'] as string) || ''
  const newPassword1 = (body['new_password1'] as string) || ''
  const newPassword2 = (body['new_password2'] as string) || ''

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
    .bind(session.userId).first<{ id: number; username: string; email: string; password_hash: string }>()
  if (!user) return c.redirect('/login')

  const fail = (msg: string) => c.html(renderAccount({ user: user!, error: msg }))

  if (!(await verifyPassword(oldPassword, user.password_hash))) return fail('Mật khẩu cũ không đúng.')
  if (newPassword1.length < 8) return fail('Mật khẩu mới phải có ít nhất 8 ký tự.')
  if (newPassword1 !== newPassword2) return fail('Mật khẩu nhập lại không khớp.')

  const newHash = await hashPassword(newPassword1)
  await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(newHash, user.id).run()

  return c.html(renderAccount({ user, success: 'Mật khẩu đã được thay đổi thành công.' }))
})

// ── Fixes TS "Context" import ──
import type { Context } from 'hono'

// ── HTML render helpers (dùng lại template từ django/templates/account/) ──
// Thay {% static %} bằng đường dẫn tuyệt đối /assets/...
// Thay {% if messages %} bằng flash object inject vào script

function renderLogin(opts: { next?: string; error?: string }): string {
  return baseAccountLayout('Đăng nhập', `
    <div class="auth__container">
      <h1 class="auth__title">Đăng nhập</h1>
      ${opts.error ? `<div class="auth__error">${opts.error}</div>` : ''}
      <form method="POST" action="/login">
        <input type="hidden" name="next" value="${opts.next ?? ''}" />
        <div class="auth__field">
          <input class="auth__input" type="text" name="username" placeholder="Tên đăng nhập hoặc Email" autocomplete="username" required />
        </div>
        <div class="auth__field">
          <input class="auth__input auth__input--has-toggle" type="password" name="password" placeholder="Mật khẩu" autocomplete="current-password" required />
        </div>
        <button class="auth__submit" type="submit">Đăng nhập</button>
        <div class="auth__links">
          <a href="/register${opts.next ? '?next=' + encodeURIComponent(opts.next) : ''}">Đăng ký</a>
          <a href="/forgot-password">Quên mật khẩu?</a>
        </div>
      </form>
    </div>
  `)
}

function renderRegister(opts: { next?: string; error?: string }): string {
  return baseAccountLayout('Đăng ký', `
    <div class="auth__container">
      <h1 class="auth__title">Đăng ký</h1>
      ${opts.error ? `<div class="auth__error">${opts.error}</div>` : ''}
      <form method="POST" action="/register">
        <input type="hidden" name="next" value="${opts.next ?? ''}" />
        <div class="auth__field"><input class="auth__input" type="text" name="username" placeholder="Tên đăng nhập" autocomplete="username" required /></div>
        <div class="auth__field"><input class="auth__input" type="email" name="email" placeholder="Email" autocomplete="email" required /></div>
        <div class="auth__field"><input class="auth__input auth__input--has-toggle" type="password" name="password" placeholder="Mật khẩu" autocomplete="new-password" required /></div>
        <div class="auth__field"><input class="auth__input auth__input--has-toggle" type="password" name="password_confirm" placeholder="Nhập lại mật khẩu" autocomplete="new-password" required /></div>
        <button class="auth__submit" type="submit">Đăng ký</button>
        <div class="auth__links">
          <a href="/login${opts.next ? '?next=' + encodeURIComponent(opts.next) : ''}">Đã có tài khoản? Đăng nhập</a>
        </div>
      </form>
    </div>
  `)
}

function renderForgotPassword(opts: { error?: string; success?: string }): string {
  return baseAccountLayout('Quên mật khẩu', `
    <div class="auth__container">
      <h1 class="auth__title">Quên mật khẩu</h1>
      ${opts.error ? `<div class="auth__error">${opts.error}</div>` : ''}
      ${opts.success ? `<div class="auth__success">${opts.success}</div>` : ''}
      <form method="POST" action="/forgot-password">
        <div class="auth__field"><input class="auth__input" type="text" name="identifier" placeholder="Email hoặc tên đăng nhập" required /></div>
        <button class="auth__submit" type="submit">Gửi yêu cầu</button>
        <div class="auth__links"><a href="/login">Quay lại đăng nhập</a></div>
      </form>
    </div>
  `)
}

function renderAccount(opts: { user: { username: string; email: string }; error?: string; success?: string }): string {
  return baseAccountLayout('Tài khoản', `
    <div class="auth__container">
      <h1 class="auth__title">Tài khoản</h1>
      <p>Xin chào, <strong>${opts.user.username}</strong> (${opts.user.email})</p>
      ${opts.error ? `<div class="auth__error">${opts.error}</div>` : ''}
      ${opts.success ? `<div class="auth__success">${opts.success}</div>` : ''}
      <h2 class="auth__subtitle">Đổi mật khẩu</h2>
      <form method="POST" action="/account">
        <div class="auth__field"><input class="auth__input auth__input--has-toggle" type="password" name="old_password" placeholder="Mật khẩu cũ" autocomplete="current-password" required /></div>
        <div class="auth__field"><input class="auth__input auth__input--has-toggle" type="password" name="new_password1" placeholder="Mật khẩu mới" autocomplete="new-password" required /></div>
        <div class="auth__field"><input class="auth__input auth__input--has-toggle" type="password" name="new_password2" placeholder="Xác nhận mật khẩu mới" autocomplete="new-password" required /></div>
        <button class="auth__submit" type="submit">Đổi mật khẩu</button>
      </form>
      <div class="auth__links"><a href="/home">Trang chủ</a> · <a href="/logout">Đăng xuất</a></div>
    </div>
  `)
}

function baseAccountLayout(title: string, content: string): string {
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — QHUN22</title>
  <link rel="stylesheet" href="/assets/css/navbar.css" />
  <link rel="stylesheet" href="/assets/css/account.css" />
  <link rel="stylesheet" href="/assets/css/toast.css" />
</head>
<body>
  <div class="page-wrapper">
    ${content}
  </div>
  <script src="/assets/js/toast.js"></script>
  <script src="/assets/js/account.js"></script>
</body>
</html>`
}
