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

  return isAjax
    ? c.json({ success: true, message: 'Nếu tài khoản tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi.' })
    : c.html(renderForgotPassword({ success: 'Nếu tài khoản tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi.' }))
})

// ── GET /logout + POST /logout ──
const logoutHandler = async () => {
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

// ── SVG icons dùng trong form ──
const eyeIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`
const eyeOffIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`

// ── Navbar (dùng trong account/base.html) — giống pages.ts nhưng auth state luôn là loggedIn=false vì đây là account pages ──
function accountNavbar(): string {
  return `<div class="navbar_top-wrapper">
  <nav id="navbar_component" class="navbar_component">
    <div class="navbar_container">
      <div class="navbar_right-wrapper">
        <button type="button" id="button_id" data-menu-role="desktop" fs-scrolldisable-element="toggle"
          class="navbar_menu-button navbar_menu-button--desktop" aria-label="Mở menu desktop">
          <div class="menu-icon">
            <div class="menu-icon_line-top"></div>
            <div class="menu-icon_line-middle"></div>
            <div class="menu-icon_line-bottom"></div>
          </div>
        </button>
        <button type="button" data-menu-role="mobile" class="navbar_menu-button navbar_menu-button--mobile" aria-label="Mở menu mobile">
          <div class="menu-icon">
            <div class="menu-icon_line-top"></div>
            <div class="menu-icon_line-middle"></div>
            <div class="menu-icon_line-bottom"></div>
          </div>
        </button>
      </div>
      <a href="/" class="navbar_logo-link w-nav-brand">
        <img src="/gif/qhun22-min.gif" alt="QHUN22 logo" class="navbar_logo" />
      </a>
      <div class="navbar_left-wrapper hide-tablet">
        <a href="#" class="navbar_link">Quote</a>
        <a href="#" class="navbar_link">Instruct</a>
        <a href="/login" class="watch-link w-inline-block">
          <div class="watch_flex-link">
            <img src="https://cdn.prod.website-files.com/662fb92f905585b61b12afd8/66436f018b6d06434419b591_play-icon.svg"
                 loading="lazy" width="24" alt="" class="button_icon" />
            <div class="watch_text text-style-allcaps">START</div>
          </div>
        </a>
      </div>
    </div>
  </nav>
  <div data-lenis-prevent fs-scrolldisable-element="when-visible" class="navbar_overlay-wrapper">
    <div class="navbar_drawer-backdrop" aria-hidden="true"></div>
    <div class="navbar_menu">
      <div class="navbar_drawer-header">
        <div class="navbar_drawer-title">MENU</div>
        <button type="button" class="navbar_menu-close" aria-label="Đóng menu">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <div class="navbar_mobile-body">
        <nav class="navbar_mobile-nav" aria-label="Menu chính">
          <a href="/" class="navbar_mobile-link js-mobile-nav-link">
            <span class="navbar_mobile-link-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <polyline points="9 22 9 12 15 12 15 22" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            <span>Trang chủ</span>
          </a>
          <details class="navbar_mobile-item">
            <summary class="navbar_mobile-link navbar_mobile-summary">
              <span class="navbar_mobile-link-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </span>
              <span>Tài khoản</span>
              <span class="navbar_mobile-chevron" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </span>
            </summary>
            <div class="navbar_mobile-subnav">
              <div class="navbar_mobile-subnav-inner">
                <a href="/login" class="navbar_mobile-sublink js-mobile-nav-link"><span class="navbar_mobile-sublink-dot"></span><span>Đăng nhập</span></a>
                <a href="/register" class="navbar_mobile-sublink js-mobile-nav-link"><span class="navbar_mobile-sublink-dot"></span><span>Đăng ký</span></a>
                <a href="/forgot-password" class="navbar_mobile-sublink js-mobile-nav-link"><span class="navbar_mobile-sublink-dot"></span><span>Quên mật khẩu</span></a>
              </div>
            </div>
          </details>
        </nav>
      </div>
      <div class="navbar_drawer-footer">
        <div class="navbar_drawer-social">
          <a href="https://www.facebook.com/userqhun/" target="_blank" rel="noopener" class="navbar_drawer-social-link" aria-label="Facebook">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </a>
          <a href="https://www.instagram.com/qhun22/" target="_blank" rel="noopener" class="navbar_drawer-social-link" aria-label="Instagram">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" stroke-width="2"/>
              <circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="2"/>
              <circle cx="17.5" cy="6.5" r="1" fill="currentColor"/>
            </svg>
          </a>
        </div>
      </div>
    </div>
  </div>
</div>`
}

// ── Base layout cho tất cả account pages (port từ templates/account/base.html) ──
function baseAccountLayout(opts: {
  title: string
  flash?: Array<{ level: string; message: string }>
  content: string
  loggedIn?: boolean
  username?: string
}): string {
  const flashJson = JSON.stringify(opts.flash ?? [])
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${opts.title} — QHUN22</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Signika:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css" />
  <link rel="stylesheet" href="/css/navbar.css" />
  <link rel="stylesheet" href="/css/z1.css" />
  <link rel="stylesheet" href="/css/z2.css" />
  <link rel="stylesheet" href="/css/toast.css" />
  <link rel="stylesheet" href="/css/account.css" />
  <style>
    .page-wrapper { background: #eaf2ff; min-height: 100vh; }
    .auth-shell { display: flex; align-items: center; justify-content: center; min-height: calc(100vh - 6rem); padding: 7rem 1rem 2rem; }
  </style>
</head>
<body>
  <div class="page-wrapper">
    ${accountNavbar()}
    <div class="auth-shell">
      ${opts.content}
    </div>
  </div>
  <script>window.__TOAST_FLASH__ = ${flashJson};</script>
  <script src="/js/toast.js"></script>
  <script src="/js/z1.js"></script>
  <script src="/js/z2.js"></script>
</body>
</html>`
}

// ── Login page (port từ templates/account/login.html) ──
function renderLogin(opts: { next?: string; error?: string }): string {
  const errorBlock = opts.error
    ? `<div class="auth__msg auth__msg--error" role="alert">${opts.error}</div>`
    : ''
  const nextValue = opts.next ?? ''
  const registerHref = nextValue
    ? `/register?next=${encodeURIComponent(nextValue)}`
    : '/register'

  const content = `<main class="auth" data-auth-type="login" data-auth-ajax="true">
  <div class="auth__card">
    <div class="auth__brand">
      <img src="/img/435325.png" alt="QHUN22" class="auth__brand-img" loading="lazy" />
    </div>
    <h1 class="auth__title">Đăng nhập</h1>
    ${errorBlock}
    <form class="auth__form" method="POST" action="/login" id="auth-form" autocomplete="on" novalidate>
      <input type="hidden" name="next" value="${nextValue}" />
      <div class="auth__field">
        <label class="auth__label" for="id_username">Tên đăng nhập hoặc Email</label>
        <input class="auth__input" type="text" name="username" id="id_username"
               placeholder="Tên đăng nhập hoặc Email"
               autocomplete="username" autocorrect="off" autocapitalize="none"
               spellcheck="false" required />
      </div>
      <div class="auth__field auth__field--password">
        <label class="auth__label" for="id_password">Mật khẩu</label>
        <div class="auth__password-wrap">
          <input class="auth__input auth__input--has-toggle" type="password" name="password" id="id_password"
                 placeholder="Mật khẩu" autocomplete="current-password" required />
          <button type="button" class="auth__eye-btn" aria-label="Hiện/ẩn mật khẩu" tabindex="-1">
            <span class="auth__eye auth__eye--show">${eyeIcon}</span>
            <span class="auth__eye auth__eye--hide" hidden>${eyeOffIcon}</span>
          </button>
        </div>
      </div>
      <div class="auth__field auth__field--row">
        <label class="auth__checkbox-label">
          <input type="checkbox" name="remember_me" class="auth__checkbox" />
          <span>Nhớ đăng nhập</span>
        </label>
        <a href="/forgot-password" class="auth__link">Quên mật khẩu?</a>
      </div>
      <button class="auth__submit" type="submit">Đăng nhập</button>
      <p class="auth__switch">Chưa có tài khoản? <a href="${registerHref}" class="auth__link">Đăng ký</a></p>
    </form>
  </div>
</main>`

  return baseAccountLayout({ title: 'Đăng nhập', content })
}

// ── Register page (port từ templates/account/register.html) ──
function renderRegister(opts: { next?: string; error?: string }): string {
  const errorBlock = opts.error
    ? `<div class="auth__msg auth__msg--error" role="alert">${opts.error}</div>`
    : ''
  const nextValue = opts.next ?? ''
  const loginHref = nextValue
    ? `/login?next=${encodeURIComponent(nextValue)}`
    : '/login'

  const content = `<main class="auth" data-auth-type="register" data-auth-ajax="true">
  <div class="auth__card">
    <div class="auth__brand">
      <img src="/img/435325.png" alt="QHUN22" class="auth__brand-img" loading="lazy" />
    </div>
    <h1 class="auth__title">Đăng ký</h1>
    ${errorBlock}
    <form class="auth__form" method="POST" action="/register" id="auth-form" autocomplete="on" novalidate>
      <input type="hidden" name="next" value="${nextValue}" />
      <div class="auth__form-row">
        <div class="auth__field">
          <label class="auth__label" for="id_username">Tên đăng nhập</label>
          <input class="auth__input" type="text" name="username" id="id_username"
                 placeholder="Tên đăng nhập"
                 autocomplete="username" autocorrect="off" autocapitalize="none"
                 spellcheck="false" required minlength="3" />
        </div>
        <div class="auth__field">
          <label class="auth__label" for="id_email">Email</label>
          <input class="auth__input" type="email" name="email" id="id_email"
                 placeholder="Email" autocomplete="email" required />
        </div>
      </div>
      <div class="auth__form-row">
        <div class="auth__field auth__field--password">
          <label class="auth__label" for="id_password">Mật khẩu</label>
          <div class="auth__password-wrap">
            <input class="auth__input auth__input--has-toggle" type="password" name="password" id="id_password"
                   placeholder="Mật khẩu" autocomplete="new-password" required minlength="8" />
            <button type="button" class="auth__eye-btn" aria-label="Hiện/ẩn mật khẩu" tabindex="-1">
              <span class="auth__eye auth__eye--show">${eyeIcon}</span>
              <span class="auth__eye auth__eye--hide" hidden>${eyeOffIcon}</span>
            </button>
          </div>
        </div>
        <div class="auth__field auth__field--password">
          <label class="auth__label" for="id_password_confirm">Nhập lại mật khẩu</label>
          <div class="auth__password-wrap">
            <input class="auth__input auth__input--has-toggle" type="password" name="password_confirm" id="id_password_confirm"
                   placeholder="Nhập lại mật khẩu" autocomplete="new-password" required minlength="8" />
            <button type="button" class="auth__eye-btn" aria-label="Hiện/ẩn mật khẩu" tabindex="-1">
              <span class="auth__eye auth__eye--show">${eyeIcon}</span>
              <span class="auth__eye auth__eye--hide" hidden>${eyeOffIcon}</span>
            </button>
          </div>
        </div>
      </div>
      <button class="auth__submit" type="submit">Đăng ký</button>
      <p class="auth__switch">Đã có tài khoản? <a href="${loginHref}" class="auth__link">Đăng nhập</a></p>
    </form>
  </div>
</main>`

  return baseAccountLayout({ title: 'Đăng ký', content })
}

// ── Forgot Password page (port từ templates/account/forgot-password.html) ──
function renderForgotPassword(opts: { error?: string; success?: string }): string {
  const msgBlock = opts.error
    ? `<div class="auth__msg auth__msg--error" role="alert">${opts.error}</div>`
    : opts.success
      ? `<div class="auth__msg auth__msg--success" role="alert">${opts.success}</div>`
      : ''

  const content = `<main class="auth" data-auth-type="forgot-password" data-auth-ajax="true">
  <div class="auth__card">
    <div class="auth__brand">
      <img src="/img/435325.png" alt="QHUN22" class="auth__brand-img" loading="lazy" />
    </div>
    <h1 class="auth__title">Quên mật khẩu</h1>
    <p class="auth__desc">Nhập email hoặc tên đăng nhập để nhận hướng dẫn đặt lại mật khẩu.</p>
    ${msgBlock}
    <form class="auth__form" method="POST" action="/forgot-password" id="auth-form" novalidate>
      <div class="auth__field">
        <label class="auth__label" for="id_identifier">Email hoặc tên đăng nhập</label>
        <input class="auth__input" type="text" name="identifier" id="id_identifier"
               placeholder="Email hoặc tên đăng nhập"
               autocomplete="username" autocorrect="off" autocapitalize="none"
               spellcheck="false" required />
      </div>
      <button class="auth__submit" type="submit">Gửi yêu cầu</button>
      <p class="auth__switch"><a href="/login" class="auth__link">← Quay lại đăng nhập</a></p>
    </form>
  </div>
</main>`

  return baseAccountLayout({ title: 'Quên mật khẩu', content })
}

// ── Account page (port từ templates/account/account.html) ──
function renderAccount(opts: {
  user: { username: string; email: string }
  error?: string
  success?: string
}): string {
  const flash: Array<{ level: string; message: string }> = []
  if (opts.error) flash.push({ level: 'error', message: opts.error })
  if (opts.success) flash.push({ level: 'success', message: opts.success })

  const content = `<main class="auth auth--account">
  <div class="auth__card account-layout">
    <section class="account-section" aria-label="Thông tin tài khoản">
      <h2 class="account-section__title">Thông tin tài khoản</h2>
      <dl class="account-details">
        <div class="account-details__row">
          <dt class="account-details__label">Tên đăng nhập</dt>
          <dd class="account-details__value">${opts.user.username}</dd>
        </div>
        <div class="account-details__row">
          <dt class="account-details__label">Email</dt>
          <dd class="account-details__value">${opts.user.email}</dd>
        </div>
      </dl>
    </section>
    <section class="account-section" aria-label="Đổi mật khẩu">
      <h2 class="account-section__title">Đổi mật khẩu</h2>
      <form class="auth__form" method="POST" action="/account" id="change-password-form" novalidate>
        <div class="auth__field auth__field--password">
          <label class="auth__label" for="id_old_password">Mật khẩu cũ</label>
          <div class="auth__password-wrap">
            <input class="auth__input auth__input--has-toggle" type="password" name="old_password" id="id_old_password"
                   placeholder="Mật khẩu cũ" autocomplete="current-password" required />
            <button type="button" class="auth__eye-btn" aria-label="Hiện/ẩn mật khẩu" tabindex="-1">
              <span class="auth__eye auth__eye--show">${eyeIcon}</span>
              <span class="auth__eye auth__eye--hide" hidden>${eyeOffIcon}</span>
            </button>
          </div>
        </div>
        <div class="auth__field auth__field--password">
          <label class="auth__label" for="id_new_password1">Mật khẩu mới</label>
          <div class="auth__password-wrap">
            <input class="auth__input auth__input--has-toggle" type="password" name="new_password1" id="id_new_password1"
                   placeholder="Mật khẩu mới" autocomplete="new-password" required minlength="8" />
            <button type="button" class="auth__eye-btn" aria-label="Hiện/ẩn mật khẩu" tabindex="-1">
              <span class="auth__eye auth__eye--show">${eyeIcon}</span>
              <span class="auth__eye auth__eye--hide" hidden>${eyeOffIcon}</span>
            </button>
          </div>
        </div>
        <div class="auth__field auth__field--password">
          <label class="auth__label" for="id_new_password2">Xác nhận mật khẩu mới</label>
          <div class="auth__password-wrap">
            <input class="auth__input auth__input--has-toggle" type="password" name="new_password2" id="id_new_password2"
                   placeholder="Xác nhận mật khẩu mới" autocomplete="new-password" required minlength="8" />
            <button type="button" class="auth__eye-btn" aria-label="Hiện/ẩn mật khẩu" tabindex="-1">
              <span class="auth__eye auth__eye--show">${eyeIcon}</span>
              <span class="auth__eye auth__eye--hide" hidden>${eyeOffIcon}</span>
            </button>
          </div>
        </div>
        <button class="auth__submit" type="submit">Đổi mật khẩu</button>
      </form>
    </section>
    <div class="account-footer-links">
      <a href="/home" class="auth__link">Trang chủ</a>
      <span class="account-footer-links__sep" aria-hidden="true">·</span>
      <a href="/logout" class="auth__link">Đăng xuất</a>
    </div>
  </div>
</main>`

  return baseAccountLayout({ title: 'Tài khoản', flash, content })
}
