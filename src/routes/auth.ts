import { Hono } from 'hono'
import type { Env } from '../index'
import { getSession, setSession, clearSession, hashPassword, verifyPassword } from '../utils/auth'

export const authRoutes = new Hono<{ Bindings: Env }>()

// ── GET /login ──
authRoutes.get('/login', async (c) => {
  const session = await getSession(c)
  if (session) return c.redirect(c.req.query('next') || '/home')
  return c.html(renderLogin({ next: c.req.query('next') || '' }))
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
  if (isAjax) return c.json({ success: true, message: 'Tài khoản đã được tạo thành công. Vui lòng đăng nhập.', redirect: loginUrl })
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

// ── GET/POST /logout ──
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

// ── POST /account ──
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

// ─────────────────────────────────────────────────────────────────────────────
// HTML helpers — port 1:1 từ django/templates/account/
// ─────────────────────────────────────────────────────────────────────────────

const SVG_EYE = `<svg data-icon="eye" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>`

const SVG_EYE_OFF = `<svg data-icon="eye-off" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display: none">
              <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
              <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
              <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
              <line x1="2" y1="2" x2="22" y2="22" />
            </svg>`

function togglePasswordBtn(target: string): string {
  return `<button type="button" class="auth__toggle-password js-toggle-password" aria-label="Hiện mật khẩu" aria-pressed="false" title="Hiện mật khẩu" data-target="${target}" tabindex="-1">
            ${SVG_EYE}
            ${SVG_EYE_OFF}
          </button>`
}

// Base layout — port từ templates/account/base.html
function baseAccountLayout(opts: {
  title: string
  flash?: Array<{ type: string; title: string; message: string }>
  content: string
}): string {
  const flashScript = (opts.flash && opts.flash.length)
    ? `<script>\n      window.__TOAST_FLASH__ = ${JSON.stringify(opts.flash)};\n    </script>`
    : ''
  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${opts.title}</title>

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
      .navbar_top-link {
        color: var(--base-color-brand--grey3);
        transition: color 0.25s ease-in-out;
      }
      .navbar_top-link:hover {
        color: var(--base-color-brand--blue) !important;
      }
      .page-wrapper {
        background: #eaf2ff;
        min-height: 100vh;
      }
      .auth-shell {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: calc(100vh - 6rem);
        padding: 7rem 1rem 2rem;
      }
    </style>
  </head>
  <body>
    <div class="page-wrapper">
      ${navbarHtml({ loggedIn: false })}

      <main class="auth-shell">${opts.content}</main>
    </div>

    ${flashScript}
    <script src="/js/toast.js"></script>
    <script src="/js/z1.js"></script>
    <script src="/js/z2.js"></script>
    <script src="/js/account.js"></script>
  </body>
</html>`
}

// ── Login page — port từ templates/account/login.html ──
function renderLogin(opts: { next?: string; error?: string }): string {
  const nextVal = opts.next ?? ''
  const regHref = nextVal ? `/register?next=${encodeURIComponent(nextVal)}` : '/register'
  const errorBlock = opts.error
    ? `<div class="auth__msg auth__msg--error" role="alert" style="color:#dc2626;margin-bottom:1rem">${opts.error}</div>`
    : ''

  const content = `<main class="auth">
  <div class="auth__card">
    <header class="auth__header">
      <div class="auth__brand">
        <img src="/img/435325.png" alt="Pocoyo waving" class="auth__brand-image" />
      </div>
      <h1 class="auth__title" id="login-title">Chào bạn quay lại!</h1>
      <p class="auth__subtitle">Đăng nhập để tiếp tục sử dụng.</p>
    </header>

    <form id="login-form" class="auth__form js-auth-form" data-auth-type="login" data-auth-ajax="true" action="/login" method="post" novalidate>
      <input type="hidden" name="next" value="${nextVal}" />
      ${errorBlock}
      <div class="auth__field">
        <label class="auth__label" for="username">Nhập Username</label>
        <div class="auth__input-wrapper">
          <input type="text" id="username" name="username" class="auth__input" placeholder="Ví dụ: qhun22." autocomplete="username" required />
        </div>
        <p class="auth__error-message js-field-error" aria-live="polite"></p>
      </div>

      <div class="auth__field">
        <label class="auth__label" for="password">Nhập Password</label>
        <div class="auth__input-wrapper">
          <input type="password" id="password" name="password" class="auth__input js-password-input auth__input--has-toggle" placeholder="Nhập mật khẩu của bạn." autocomplete="current-password" required />
          ${togglePasswordBtn('password')}
        </div>
        <p class="auth__error-message js-field-error" aria-live="polite"></p>
      </div>

      <div class="auth__options">
        <label class="auth__remember">
          <input type="checkbox" name="remember" class="auth__checkbox js-remember-checkbox" value="1" />
          <span>Ghi nhớ</span>
        </label>
        <a href="/forgot-password" class="auth__forgot-link">Quên mật khẩu?</a>
      </div>

      <button type="submit" class="auth__button" aria-label="Đăng nhập">Đăng nhập</button>

      <p class="auth__footer">
        Chưa có tài khoản?
        <a href="${regHref}" class="auth__footer-link">Đăng ký.</a>
      </p>
    </form>
  </div>
</main>`

  return baseAccountLayout({ title: 'Đăng nhập | QHUN22', content })
}

// ── Register page — port từ templates/account/register.html ──
function renderRegister(opts: { next?: string; error?: string }): string {
  const nextVal = opts.next ?? ''
  const loginHref = `/login${nextVal ? '?next=' + encodeURIComponent(nextVal) : ''}`
  const errorBlock = opts.error
    ? `<div class="auth__msg auth__msg--error" role="alert" style="color:#dc2626;margin-bottom:1rem">${opts.error}</div>`
    : ''

  const content = `<main class="auth">
  <div class="auth__card">
    <header class="auth__header">
      <div class="auth__brand">
        <img src="/img/435325.png" alt="Pocoyo waving" class="auth__brand-image" />
      </div>
      <h1 class="auth__title" id="register-title">Tạo tài khoản mới!</h1>
      <p class="auth__subtitle">Đăng ký để bắt đầu sử dụng.</p>
    </header>

    <form id="register-form" class="auth__form js-auth-form" data-auth-type="register" data-auth-ajax="true" action="/register" method="post" novalidate>
      <input type="hidden" name="next" value="${nextVal}" />
      ${errorBlock}
      <div class="auth__form-row">
        <div class="auth__field">
          <label class="auth__label" for="username">Nhập Username</label>
          <div class="auth__input-wrapper">
            <input type="text" id="username" name="username" class="auth__input" placeholder="Ví dụ: qhun22." autocomplete="username" maxlength="150" required />
          </div>
          <p class="auth__error-message js-field-error" aria-live="polite"></p>
        </div>

        <div class="auth__field">
          <label class="auth__label" for="email">Nhập Email</label>
          <div class="auth__input-wrapper">
            <input type="email" id="email" name="email" class="auth__input" placeholder="Ví dụ: qhun22@gmail.com." autocomplete="email" required />
          </div>
          <p class="auth__error-message js-field-error" aria-live="polite"></p>
        </div>
      </div>

      <div class="auth__form-row">
        <div class="auth__field">
          <label class="auth__label" for="password">Nhập Password</label>
          <div class="auth__input-wrapper">
            <input type="password" id="password" name="password" class="auth__input js-password-input auth__input--has-toggle" placeholder="Nhập mật khẩu." autocomplete="new-password" minlength="8" required />
            ${togglePasswordBtn('password')}
          </div>
          <p class="auth__error-message js-field-error" aria-live="polite"></p>
        </div>

        <div class="auth__field">
          <label class="auth__label" for="password_confirm">Nhập lại Password</label>
          <div class="auth__input-wrapper">
            <input type="password" id="password_confirm" name="password_confirm" class="auth__input js-password-input auth__input--has-toggle" placeholder="Nhập lại mật khẩu." autocomplete="new-password" minlength="8" required />
            ${togglePasswordBtn('password_confirm')}
          </div>
          <p class="auth__error-message js-field-error" aria-live="polite"></p>
        </div>
      </div>

      <button type="submit" class="auth__button" aria-label="Đăng ký">Đăng ký</button>

      <p class="auth__footer">
        Đã có tài khoản?
        <a href="${loginHref}" class="auth__footer-link">Đăng nhập.</a>
      </p>
    </form>
  </div>
</main>`

  return baseAccountLayout({ title: 'Đăng ký | QHUN22', content })
}

// ── Forgot password page — port từ templates/account/forgot-password.html ──
function renderForgotPassword(opts: { error?: string; success?: string }): string {
  const msgBlock = opts.error
    ? `<div class="auth__msg auth__msg--error" role="alert" style="color:#dc2626;margin-bottom:1rem">${opts.error}</div>`
    : opts.success
      ? `<div class="auth__msg auth__msg--success" role="alert" style="color:#16a34a;margin-bottom:1rem">${opts.success}</div>`
      : ''

  const content = `<main class="auth">
  <div class="auth__card">
    <header class="auth__header">
      <div class="auth__brand">
        <img src="/img/435325.png" alt="Pocoyo waving" class="auth__brand-image" />
      </div>
      <h1 class="auth__title" id="forgot-title">Quên mật khẩu?</h1>
      <p class="auth__subtitle">Nhập email hoặc tên đăng nhập để đặt lại mật khẩu.</p>
    </header>

    <form id="forgot-form" class="auth__form js-auth-form" data-auth-type="forgot" data-auth-ajax="true" action="/forgot-password" method="post" novalidate>
      ${msgBlock}
      <div class="auth__field">
        <label class="auth__label" for="identifier">Nhập Email hoặc Username</label>
        <div class="auth__input-wrapper">
          <input type="text" id="identifier" name="identifier" class="auth__input" placeholder="Ví dụ: qhun22@gmail.com hoặc qhun22." autocomplete="username" required />
        </div>
        <p class="auth__error-message js-field-error" aria-live="polite"></p>
      </div>

      <button type="submit" class="auth__button" aria-label="Tiếp tục">Tiếp tục</button>

      <p class="auth__footer">
        Đã nhớ mật khẩu?
        <a href="/login" class="auth__footer-link">Đăng nhập.</a>
      </p>
    </form>
  </div>
</main>`

  return baseAccountLayout({ title: 'Quên mật khẩu | QHUN22', content })
}

// ── Account page — port từ templates/account/account.html ──
function renderAccount(opts: {
  user: { username: string; email: string }
  error?: string
  success?: string
}): string {
  const flash = []
  if (opts.error) flash.push({ type: 'error', title: 'Lỗi', message: opts.error, duration_ms: 5000 })
  if (opts.success) flash.push({ type: 'success', title: 'Thành công', message: opts.success, duration_ms: 5000 })

  const content = `<main class="auth auth--account">
  <div class="account-layout">
    <section class="auth__card account-panel">
      <header class="account-panel__header">
        <h1 class="account-panel__title">Thông Tin Tài Khoản</h1>
      </header>
      <dl class="account-details">
        <div class="account-detail">
          <dt>Tên Đăng Nhập</dt>
          <dd>${opts.user.username}</dd>
        </div>
        <div class="account-detail">
          <dt>Địa Chỉ E-Mail</dt>
          <dd>${opts.user.email || 'Chưa cập nhật'}</dd>
        </div>
      </dl>
    </section>

    <section class="auth__card account-panel">
      <header class="account-panel__header">
        <h2 class="account-panel__title">Thay Đổi Mật Khẩu</h2>
      </header>
      <form method="post" action="/account" class="auth__form account-password-form" novalidate>
        <div class="auth__field">
          <label class="auth__label" for="old_password">Mật khẩu cũ</label>
          <div class="auth__input-wrapper">
            <input type="password" id="old_password" name="old_password" class="auth__input js-password-input auth__input--has-toggle" placeholder="Nhập mật khẩu cũ." autocomplete="current-password" required />
            ${togglePasswordBtn('old_password')}
          </div>
        </div>
        <div class="auth__field">
          <label class="auth__label" for="new_password1">Mật khẩu mới</label>
          <div class="auth__input-wrapper">
            <input type="password" id="new_password1" name="new_password1" class="auth__input js-password-input auth__input--has-toggle" placeholder="Nhập mật khẩu mới." autocomplete="new-password" minlength="8" required />
            ${togglePasswordBtn('new_password1')}
          </div>
        </div>
        <div class="auth__field">
          <label class="auth__label" for="new_password2">Xác nhận mật khẩu mới</label>
          <div class="auth__input-wrapper">
            <input type="password" id="new_password2" name="new_password2" class="auth__input js-password-input auth__input--has-toggle" placeholder="Nhập lại mật khẩu mới." autocomplete="new-password" minlength="8" required />
            ${togglePasswordBtn('new_password2')}
          </div>
        </div>
        <button type="submit" class="auth__button">Đổi Mật Khẩu</button>
      </form>
    </section>
  </div>
</main>`

  return baseAccountLayout({ title: 'PROFILE | QHUN22', flash: flash as never, content })
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared navbar function — used by baseAccountLayout AND pages.ts
// ─────────────────────────────────────────────────────────────────────────────
export function navbarHtml(opts: { loggedIn: boolean; username?: string }): string {
  const homeLogoHref = opts.loggedIn ? '/home' : '/'
  const mobileHomeHref = opts.loggedIn ? '/home' : '/login'

  const desktopAuthLinks = opts.loggedIn
    ? `<a href="/account" class="navbar_menu-content-link">Tài khoản.</a>
                  <a href="/logout" class="navbar_menu-content-link">Đăng xuất.</a>`
    : `<a href="/login" class="navbar_menu-content-link">Đăng nhập.</a>
                  <a href="/register" class="navbar_menu-content-link">Đăng ký.</a>
                  <a href="/forgot-password" class="navbar_menu-content-link">Quên mật khẩu.</a>`

  const mobileAuthLinks = opts.loggedIn
    ? `<a href="/account" class="navbar_mobile-sublink js-mobile-nav-link">
                  <span class="navbar_mobile-sublink-dot"></span>
                  <span>Tài khoản</span>
                </a>
                <a href="/logout" class="navbar_mobile-sublink js-mobile-nav-link">
                  <span class="navbar_mobile-sublink-dot"></span>
                  <span>Đăng xuất</span>
                </a>`
    : `<a href="/login" class="navbar_mobile-sublink js-mobile-nav-link">
                  <span class="navbar_mobile-sublink-dot"></span>
                  <span>Đăng nhập</span>
                </a>
                <a href="/register" class="navbar_mobile-sublink js-mobile-nav-link">
                  <span class="navbar_mobile-sublink-dot"></span>
                  <span>Đăng ký</span>
                </a>
                <a href="/forgot-password" class="navbar_mobile-sublink js-mobile-nav-link">
                  <span class="navbar_mobile-sublink-dot"></span>
                  <span>Quên mật khẩu</span>
                </a>`

  const watchBlock = opts.loggedIn
    ? `<a href="/account" class="watch-link w-inline-block">
          <div class="watch_flex-link">
            <div class="watch_text text-style-allcaps">${opts.username}</div>
          </div>
        </a>`
    : `<a href="/login" class="watch-link w-inline-block">
          <div class="watch_flex-link">
            <img src="https://cdn.prod.website-files.com/662fb92f905585b61b12afd8/66436f018b6d06434419b591_play-icon.svg" loading="lazy" width="24" alt="" class="button_icon" />
            <div class="watch_text text-style-allcaps">START</div>
          </div>
        </a>`

  return `<div class="navbar_top-wrapper">
  <nav id="navbar_component" class="navbar_component">
    <div class="navbar_container">
      <div class="navbar_right-wrapper">
        <button type="button" id="button_id" data-menu-role="desktop" fs-scrolldisable-element="toggle" class="navbar_menu-button navbar_menu-button--desktop" aria-label="Mở menu desktop">
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
      <a href="${homeLogoHref}" aria-current="page" class="navbar_logo-link w-nav-brand w--current">
        <img src="/gif/qhun22-min.gif" alt="QHUN22 logo" class="navbar_logo" />
      </a>
      <div class="navbar_left-wrapper hide-tablet">
        <a href="#" class="navbar_link">Quote</a>
        <a href="#" class="navbar_link">Instruct</a>
        ${watchBlock}
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
            <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
          </svg>
        </button>
      </div>

      <div class="navbar_mobile-body">
        <nav class="navbar_mobile-nav" aria-label="Menu chính">
          <a href="${mobileHomeHref}" class="navbar_mobile-link js-mobile-nav-link">
            <span class="navbar_mobile-link-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                <polyline points="9 22 9 12 15 12 15 22" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </span>
            <span>Trang chủ</span>
          </a>

          <details class="navbar_mobile-item">
            <summary class="navbar_mobile-link navbar_mobile-summary">
              <span class="navbar_mobile-link-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </span>
              <span>Tài khoản</span>
              <span class="navbar_mobile-chevron" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </span>
            </summary>
            <div class="navbar_mobile-subnav">
              <div class="navbar_mobile-subnav-inner">
                ${mobileAuthLinks}
              </div>
            </div>
          </details>

          <details class="navbar_mobile-item">
            <summary class="navbar_mobile-link navbar_mobile-summary">
              <span class="navbar_mobile-link-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </span>
              <span>Bảng giá</span>
              <span class="navbar_mobile-chevron" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </span>
            </summary>
            <div class="navbar_mobile-subnav">
              <a href="#" class="navbar_mobile-sublink js-mobile-nav-link"><span class="navbar_mobile-sublink-dot"></span><span>Gói miễn phí</span></a>
              <a href="#" class="navbar_mobile-sublink js-mobile-nav-link"><span class="navbar_mobile-sublink-dot"></span><span>Gói cá nhân</span></a>
            </div>
          </details>

          <details class="navbar_mobile-item">
            <summary class="navbar_mobile-link navbar_mobile-summary">
              <span class="navbar_mobile-link-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </span>
              <span>Hướng dẫn</span>
              <span class="navbar_mobile-chevron" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </span>
            </summary>
            <div class="navbar_mobile-subnav">
              <a href="#" class="navbar_mobile-sublink js-mobile-nav-link"><span class="navbar_mobile-sublink-dot"></span><span>Cách thao tác</span></a>
            </div>
          </details>

          <details class="navbar_mobile-item">
            <summary class="navbar_mobile-link navbar_mobile-summary">
              <span class="navbar_mobile-link-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </span>
              <span>Về chúng tôi</span>
              <span class="navbar_mobile-chevron" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </span>
            </summary>
            <div class="navbar_mobile-subnav">
              <a href="#" class="navbar_mobile-sublink js-mobile-nav-link"><span class="navbar_mobile-sublink-dot"></span><span>Xem chi tiết</span></a>
            </div>
          </details>

          <details class="navbar_mobile-item">
            <summary class="navbar_mobile-link navbar_mobile-summary">
              <span class="navbar_mobile-link-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </span>
              <span>Hỗ trợ</span>
              <span class="navbar_mobile-chevron" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </span>
            </summary>
            <div class="navbar_mobile-subnav">
              <a href="#" class="navbar_mobile-sublink js-mobile-nav-link"><span class="navbar_mobile-sublink-dot"></span><span>Xem chi tiết</span></a>
            </div>
          </details>

          <details class="navbar_mobile-item">
            <summary class="navbar_mobile-link navbar_mobile-summary">
              <span class="navbar_mobile-link-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 4h16v16H4z M4 4l8 8 8-8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </span>
              <span>Gif</span>
              <span class="navbar_mobile-chevron" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </span>
            </summary>
            <div class="navbar_mobile-subnav">
              <a href="#" class="navbar_mobile-sublink js-mobile-nav-link"><span class="navbar_mobile-sublink-dot"></span><span>Mã Gif</span></a>
            </div>
          </details>
        </nav>
      </div>

      <div class="navbar_drawer-footer">
        <div class="navbar_drawer-social">
          <a href="https://www.facebook.com/userqhun/" target="_blank" rel="noopener" class="navbar_drawer-social-link" aria-label="Facebook">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </a>
          <a href="https://www.instagram.com/qhun22/" target="_blank" rel="noopener" class="navbar_drawer-social-link" aria-label="Instagram">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" stroke-width="2" />
              <circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="2" />
              <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
            </svg>
          </a>
        </div>
      </div>

      <div class="navbar_menu-content navbar_menu-content-desktop-only">
        <div class="navbar_menu-content-left">
          <div class="navbar_menu-content-fixed">
            <div class="navbar_dropdown w-dropdown">
              <div class="navbar_dropdown-toggle w-dropdown-toggle">
                <a href="/episodes" class="display-flex-h-left-center is-tiny w-inline-block navbar_top-link">
                  <span class="icon-arrow"></span>
                  <div class="heading-style-h5">Tài khoản</div>
                </a>
              </div>
              <nav class="navbar_dropdown-list w-dropdown-list">
                <div class="navbar_menu-content-wrapper">
                  ${desktopAuthLinks}
                </div>
              </nav>
            </div>
          </div>

          <div class="navbar_menu-content-fixed">
            <div class="navbar_dropdown w-dropdown">
              <div class="navbar_dropdown-toggle w-dropdown-toggle">
                <a href="/characters" class="display-flex-h-left-center is-tiny w-inline-block navbar_top-link">
                  <span class="icon-arrow"></span>
                  <div class="heading-style-h5">Bảng giá</div>
                </a>
              </div>
              <nav class="navbar_dropdown-list w-dropdown-list">
                <div class="navbar_menu-content-wrapper">
                  <a href="#" class="navbar_menu-content-link">Gói miễn phí.</a>
                  <a href="#" class="navbar_menu-content-link">Gói cá nhân.</a>
                </div>
              </nav>
            </div>
          </div>

          <div class="navbar_menu-content-fixed">
            <div class="navbar_dropdown w-dropdown">
              <div class="navbar_dropdown-toggle w-dropdown-toggle">
                <a href="/listen" class="display-flex-h-left-center is-tiny w-inline-block navbar_top-link">
                  <span class="icon-arrow"></span>
                  <div class="heading-style-h5">Hướng dẫn</div>
                </a>
              </div>
              <nav class="navbar_dropdown-list w-dropdown-list">
                <div class="navbar_menu-content-wrapper">
                  <a href="#" class="navbar_menu-content-link">Cách thao tác.</a>
                </div>
              </nav>
            </div>
          </div>

          <div class="navbar_menu-content-fixed">
            <div class="navbar_dropdown w-dropdown">
              <div class="navbar_dropdown-toggle w-dropdown-toggle">
                <a href="/make" class="display-flex-h-left-center is-tiny w-inline-block navbar_top-link">
                  <span class="icon-arrow"></span>
                  <div class="heading-style-h5">Về chúng tôi</div>
                </a>
              </div>
              <nav class="navbar_dropdown-list w-dropdown-list">
                <div class="navbar_menu-content-wrapper">
                  <a href="#" class="navbar_menu-content-link">Xem chi tiết.</a>
                </div>
              </nav>
            </div>
          </div>

          <div class="navbar_menu-content-fixed">
            <div class="navbar_dropdown w-dropdown">
              <div class="navbar_dropdown-toggle w-dropdown-toggle">
                <a href="/play" class="display-flex-h-left-center is-tiny w-inline-block navbar_top-link">
                  <span class="icon-arrow"></span>
                  <div class="heading-style-h5">Hỗ trợ</div>
                </a>
              </div>
              <nav class="navbar_dropdown-list w-dropdown-list">
                <div class="navbar_menu-content-wrapper">
                  <a href="#" class="navbar_menu-content-link">Xem chi tiết.</a>
                </div>
              </nav>
            </div>
          </div>

          <div class="navbar_menu-content-fixed">
            <div class="navbar_dropdown w-dropdown">
              <div class="navbar_dropdown-toggle w-dropdown-toggle">
                <a href="/read" class="display-flex-h-left-center is-tiny w-inline-block navbar_top-link">
                  <span class="icon-arrow"></span>
                  <div class="heading-style-h5">Gif</div>
                </a>
              </div>
              <nav class="navbar_dropdown-list w-dropdown-list">
                <div class="navbar_menu-content-wrapper">
                  <a href="#" class="navbar_menu-content-link">Mã Gif.</a>
                </div>
              </nav>
            </div>
          </div>
        </div>

        <a href="#" class="navbar_menu-content-right hide-tablet relative w-inline-block">
          <div class="heading-style-h2 text-color-blue z-index-2">qhun22</div>
          <img src="https://cdn.prod.website-files.com/662fb92f905585b61b12afd8/6822c6cdf50740203b81634b_pocoyo-songs.avif" loading="lazy" width="284" alt="Pocoyo songs" class="navbar_pocoyo-songs-image" />
        </a>
      </div>

      <div class="z-index-2 navbar_bottom-desktop-only">
        <div class="navbar_bottom">
          <div class="navbar_flag-component hide-tablet">
            <div class="w-dropdown">
              <div class="navbar_flag-wrapper w-dropdown-toggle">
                <div>VIE</div>
                <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 900 600'%3E%3Crect width='900' height='600' fill='%23da251d'/%3E%3Cpolygon points='450,150 485,258 608,258 508,326 546,434 450,380 354,434 392,326 292,258 415,258' fill='%23ffff00'/%3E%3C/svg%3E" loading="lazy" alt="Vietnam flag" class="navbar_flag-image" />
              </div>
            </div>
          </div>
          <div class="w-layout-grid navbar_social-list">
            <a href="https://www.instagram.com/pocoyo/" target="_blank" class="w-inline-block">
              <div class="footer_social-icon w-embed">
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M10.4001 2.66669H21.6001C25.8667 2.66669 29.3334 6.13335 29.3334 10.4V21.6C29.3334 23.651 28.5187 25.618 27.0684 27.0683C25.6181 28.5186 23.6511 29.3334 21.6001 29.3334H10.4001C6.13341 29.3334 2.66675 25.8667 2.66675 21.6V10.4C2.66675 8.34901 3.48151 6.38201 4.93179 4.93173C6.38207 3.48145 8.34907 2.66669 10.4001 2.66669ZM10.1334 5.33335C8.86037 5.33335 7.63948 5.83907 6.7393 6.73924C5.83913 7.63942 5.33341 8.86031 5.33341 10.1334V21.8667C5.33341 24.52 7.48008 26.6667 10.1334 26.6667H21.8667C23.1398 26.6667 24.3607 26.161 25.2609 25.2608C26.161 24.3606 26.6667 23.1397 26.6667 21.8667V10.1334C26.6667 7.48002 24.5201 5.33335 21.8667 5.33335H10.1334ZM23.0001 7.33335C23.4421 7.33335 23.866 7.50895 24.1786 7.82151C24.4912 8.13407 24.6667 8.55799 24.6667 9.00002C24.6667 9.44205 24.4912 9.86597 24.1786 10.1785C23.866 10.4911 23.4421 10.6667 23.0001 10.6667C22.5581 10.6667 22.1341 10.4911 21.8216 10.1785C21.509 9.86597 21.3334 9.44205 21.3334 9.00002C21.3334 8.55799 21.509 8.13407 21.8216 7.82151C22.1341 7.50895 22.5581 7.33335 23.0001 7.33335ZM16.0001 9.33335C17.7682 9.33335 19.4639 10.0357 20.7141 11.286C21.9644 12.5362 22.6667 14.2319 22.6667 16C22.6667 17.7681 21.9644 19.4638 20.7141 20.7141C19.4639 21.9643 17.7682 22.6667 16.0001 22.6667C14.232 22.6667 12.5363 21.9643 11.286 20.7141C10.0358 19.4638 9.33341 17.7681 9.33341 16C9.33341 14.2319 10.0358 12.5362 11.286 11.286C12.5363 10.0357 14.232 9.33335 16.0001 9.33335ZM16.0001 12C14.9392 12 13.9218 12.4214 13.1717 13.1716C12.4215 13.9217 12.0001 14.9392 12.0001 16C12.0001 17.0609 12.4215 18.0783 13.1717 18.8284C13.9218 19.5786 14.9392 20 16.0001 20C17.0609 20 18.0784 19.5786 18.8285 18.8284C19.5787 18.0783 20.0001 17.0609 20.0001 16C20.0001 14.9392 19.5787 13.9217 18.8285 13.1716C18.0784 12.4214 17.0609 12 16.0001 12Z" fill="currentColor" />
                </svg>
              </div>
            </a>
            <a href="https://www.facebook.com/pocoyo/" target="_blank" class="w-inline-block">
              <div class="footer_social-icon w-embed">
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M29.3334 16C29.3334 8.64002 23.3601 2.66669 16.0001 2.66669C8.64008 2.66669 2.66675 8.64002 2.66675 16C2.66675 22.4534 7.25341 27.8267 13.3334 29.0667V20H10.6667V16H13.3334V12.6667C13.3334 10.0934 15.4267 8.00002 18.0001 8.00002H21.3334V12H18.6667C17.9334 12 17.3334 12.6 17.3334 13.3334V16H21.3334V20H17.3334V29.2667C24.0667 28.6 29.3334 22.92 29.3334 16Z" fill="currentColor" />
                </svg>
              </div>
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`
}
