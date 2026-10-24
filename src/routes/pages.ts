// Port từ django/lmsictu/views.py: index_view, home, tao_mon_hoc, tao_de, tao_de_cau_hinh
// Render HTML bằng template string (thay Django template engine)

import { Hono } from 'hono'
import type { Env } from '../index'
import { getSession } from '../utils/auth'

export const pageRoutes = new Hono<{ Bindings: Env }>()

// ── GET / → index_view ──
pageRoutes.get('/', async (c) => {
  const session = await getSession(c)
  if (session) return c.redirect('/home')
  return c.html(renderIndex())
})

// ── GET /home ──
pageRoutes.get('/home', async (c) => {
  const session = await getSession(c)
  if (!session) return c.redirect('/login?next=/home')
  return c.html(renderHome({ username: session.username }))
})

// ── GET /tao-mon-hoc ──
pageRoutes.get('/tao-mon-hoc', async (c) => {
  const session = await getSession(c)
  if (!session) return c.redirect('/login?next=/tao-mon-hoc')
  return c.html(renderTaoMonHoc({ username: session.username }))
})

// ── GET /tao-de ──
pageRoutes.get('/tao-de', async (c) => {
  const session = await getSession(c)
  if (!session) return c.redirect('/login?next=/tao-de')

  // Load subjects + weeks để inject vào template (tương đương Django view)
  const { results: subjects } = await c.env.DB.prepare(
    'SELECT id, name FROM subject WHERE creator_id = ? ORDER BY name'
  ).bind(session.userId).all<{ id: number; name: string }>()

  const initialSubjects: Array<{ id: number; name: string; weeks: unknown[] }> = []
  for (const subj of subjects) {
    const { results: weeks } = await c.env.DB.prepare(
      'SELECT id, name, topics, link, quiz_code, active FROM week WHERE subject_id = ? ORDER BY id'
    ).bind(subj.id).all<{ id: number; name: string; topics: string; link: string; quiz_code: string; active: number }>()
    initialSubjects.push({
      id: subj.id,
      name: subj.name,
      weeks: weeks.map((w) => ({ ...w, topics: safeJson(w.topics, []), active: Boolean(w.active) })),
    })
  }

  return c.html(renderTaoDe({ username: session.username, initialSubjects }))
})

// ── GET /tao-de-cau-hinh ──
pageRoutes.get('/tao-de-cau-hinh', async (c) => {
  const session = await getSession(c)
  if (!session) return c.redirect('/login?next=/tao-de-cau-hinh')

  const quizCode = c.req.query('quiz') || ''
  return c.html(renderTaoDeCauHinh({ username: session.username, quizCode }))
})

// ── Shared layout ──
function baseLayout(title: string, extraCss: string[], content: string, extraJs: string[]): string {
  const cssLinks = extraCss.map((href) => `<link rel="stylesheet" href="${href}" />`).join('\n    ')
  const jsScripts = extraJs.map((src) => `<script src="${src}"></script>`).join('\n  ')
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — QHUN22</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Signika:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/css/navbar.css" />
  <link rel="stylesheet" href="/css/toast.css" />
  ${cssLinks}
</head>
<body>
  <div class="page-wrapper">
    ${content}
  </div>
  <script src="/js/toast.js"></script>
  ${jsScripts}
</body>
</html>`
}

function navbar(username?: string): string {
  return `<nav class="navbar">
    <div class="navbar_wrapper">
      <a href="/" class="navbar_logo">QHUN22</a>
      <div class="navbar_links">
        ${username
    ? `<a href="/home" class="navbar_link">Trang chủ</a>
           <a href="/tao-mon-hoc" class="navbar_link">Môn học</a>
           <a href="/tao-de" class="navbar_link">Tạo đề</a>
           <a href="/account" class="navbar_link">${username}</a>
           <a href="/logout" class="navbar_link">Đăng xuất</a>`
    : `<a href="/login" class="navbar_link">Đăng nhập</a>
           <a href="/register" class="navbar_link">Đăng ký</a>`}
      </div>
    </div>
  </nav>`
}

// ── Trang index (landing page — tương đương templates/index.html) ──
function renderIndex(): string {
  return baseLayout('QHUN22', ['https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css', '/css/z1.css', '/css/z2.css'], `
    ${navbar()}
    <main class="main-wrapper">
      <section class="section_hero">
        <div class="padding-global">
          <div class="padding-top padding-xhuge">
            <div class="container-large">
              <div class="hero_component relative overflow-hidden swiper">
                <div class="hero_wrapper swiper-wrapper">
                  <div class="hero_content-lottie swiper-slide">
                    <div class="hero_lottie"></div>
                    <img src="https://cdn.prod.website-files.com/662fb92f905585b61b12afd8/666af67c534d424825188e46_loop_pcy%20saying%20hi%20crop.gif"
                         loading="eager" alt="Pocoyo saying hi" id="hero_image" class="hero_image-pocoyo-gif" />
                  </div>
                  <div class="hero_content swiper-slide">
                    <div class="hero_slider-content">
                      <div class="hero_slider-content-wrapper">
                        <div class="margin-bottom margin-xhuge">
                          <div class="margin-bottom margin-custom1">
                            <p class="heading-style-h1 text-color-blue">Join the Group</p>
                          </div>
                          <p class="hero_content-paragraph">Tham gia cộng đồng QHUN22 trên Zalo để nhận thông tin mới nhất.</p>
                        </div>
                        <a href="https://zalo.me/g/wkcngh456" target="_blank" rel="noopener noreferrer" class="hero_button w-button">Tham gia!</a>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="about_slider-dots"></div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
    <footer class="footer_bottom-bar">
      <div class="padding-global"><div class="container-large">
        <div class="footer_bottom-content"><p class="footer_copyright">&copy;QHUN22!</p></div>
      </div></div>
    </footer>
  `, [
    'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.12.2/lottie.min.js',
    '/js/z1.js',
    '/js/z2.js',
  ])
}

// ── Trang home ──
function renderHome(opts: { username: string }): string {
  return baseLayout('Trang chủ', ['/css/home.css'], `
    ${navbar(opts.username)}
    <main class="main-wrapper">
      <div id="home-app" data-username="${opts.username}"></div>
    </main>
  `, ['/js/home.js'])
}

// ── Trang tạo môn học ──
function renderTaoMonHoc(opts: { username: string }): string {
  return baseLayout('Tạo môn học', ['/css/tao-mon-hoc.css'], `
    ${navbar(opts.username)}
    <main class="main-wrapper">
      <div id="tao-mon-hoc-app"></div>
    </main>
  `, ['/js/tao-mon-hoc.js'])
}

// ── Trang tạo đề ──
function renderTaoDe(opts: { username: string; initialSubjects: unknown[] }): string {
  const subjectsJson = JSON.stringify(opts.initialSubjects)
  return baseLayout('Tạo đề', ['/css/tao-de.css'], `
    ${navbar(opts.username)}
    <main class="main-wrapper">
      <div id="tao-de-app"></div>
      <script>window.__INITIAL_SUBJECTS__ = ${subjectsJson};</script>
    </main>
  `, ['/js/tao-de.js'])
}

// ── Trang cấu hình đề ──
function renderTaoDeCauHinh(opts: { username: string; quizCode: string }): string {
  return baseLayout('Cấu hình bài thi', ['/css/tao-de-cau-hinh.css'], `
    ${navbar(opts.username)}
    <main class="main-wrapper">
      <div id="cau-hinh-app" data-quiz-code="${opts.quizCode}"></div>
    </main>
  `, ['/js/tao-de-cau-hinh.js'])
}

function safeJson<T>(str: string, fallback: T): T {
  try { return JSON.parse(str) } catch { return fallback }
}
