import { Hono } from 'hono'
import type { Env } from '../index'
import { getSession } from '../utils/auth'
import { navbarHtml } from './auth'

export const pageRoutes = new Hono<{ Bindings: Env }>()

// ── GET / ──
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
  return c.html(renderTaoMonHoc())
})

// ── GET /tao-de ──
pageRoutes.get('/tao-de', async (c) => {
  const session = await getSession(c)
  if (!session) return c.redirect('/login?next=/tao-de')

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

  return c.html(renderTaoDe({ initialSubjects }))
})

// ── GET /tao-de-cau-hinh ──
pageRoutes.get('/tao-de-cau-hinh', async (c) => {
  const session = await getSession(c)
  if (!session) return c.redirect('/login?next=/tao-de-cau-hinh')
  const quizCode = c.req.query('quiz') || ''
  return c.html(renderTaoDeCauHinh({ quizCode }))
})

// ─────────────────────────────────────────────────────────────────────────────
// HTML — port 1:1 từ django/templates/
// ─────────────────────────────────────────────────────────────────────────────

// ── Index (landing) — port từ templates/index.html ──
function renderIndex(): string {
  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="Trang chủ QHUN22" />
    <title>QHUN22</title>

    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Signika:wght@400;500;600;700&display=swap" rel="stylesheet" />

    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css" />
    <link rel="stylesheet" href="/css/navbar.css" />
    <link rel="stylesheet" href="/css/z1.css" />
    <link rel="stylesheet" href="/css/z2.css" />
    <link rel="stylesheet" href="/css/toast.css" />

    <style>
      .navbar_top-link {
        color: var(--base-color-brand--grey3);
        transition: color 0.25s ease-in-out;
      }
      .navbar_top-link:hover {
        color: var(--base-color-brand--blue) !important;
      }
      @media (min-width: 992px) and (max-width: 1200px) {
        .navbar_left-wrapper { gap: 0.75rem; }
        .navbar_link { padding-left: 0.5rem; padding-right: 0.5rem; }
      }
    </style>
  </head>
  <body>
    <div class="page-wrapper">
      ${navbarHtml({ loggedIn: false })}

      <main class="main-wrapper">
        <section class="section_hero">
          <div class="padding-global">
            <div class="padding-top padding-xhuge">
              <div class="container-large">
                <div class="hero_component relative overflow-hidden swiper">
                  <div class="hero_wrapper swiper-wrapper">
                    <div class="hero_content-lottie swiper-slide">
                      <div class="hero_lottie"></div>
                      <img src="https://cdn.prod.website-files.com/662fb92f905585b61b12afd8/666af67c534d424825188e46_loop_pcy%20saying%20hi%20crop.gif" loading="eager" alt="Pocoyo saying hi" id="hero_image" class="hero_image-pocoyo-gif" />
                    </div>
                    <div class="hero_content swiper-slide">
                      <div class="hero_slider-content">
                        <div class="hero_slider-content-wrapper">
                          <div class="margin-bottom margin-xhuge">
                            <div class="margin-bottom margin-custom1">
                              <p class="heading-style-h1 text-color-blue">Join the Group</p>
                            </div>
                            <p class="hero_content-paragraph">
                              Tham gia cộng đồng QHUN22 trên Zalo để nhận thông tin mới nhất, cập nhật nội dung và hỗ trợ nhanh chóng từ nhóm.
                            </p>
                          </div>
                          <div class="text-align-center-mobile">
                            <a href="https://zalo.me/g/wkcngh456" target="_blank" rel="noopener noreferrer" class="hero_button w-button">Tham gia!</a>
                          </div>
                        </div>
                        <div class="hero_slider-image-wrapper">
                          <img src="https://cdn.prod.website-files.com/662fb92f905585b61b12afd8/667423d11e8de28d508366bd_cartoon-bird-with-envelope.webp" loading="lazy" alt="Cartoon bird with envelope" class="hero_content-image" />
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

        <section class="section_bento">
          <div class="padding-global">
            <div class="padding-bottom padding-xlarge">
              <div class="container-large">
                <div class="hero_title-wrapper">
                  <div class="margin-bottom margin-medium">
                    <div class="text-color-blue">
                      <h1 class="heading-style-h1">Welcome to the world of qhun22!</h1>
                    </div>
                  </div>
                </div>
                <div class="margin-top margin-xlarge">
                  <div class="w-layout-grid bento_home-top">
                    <div class="bento_episodes-wrapper">
                      <div class="bento_episodes-title">COMMUNITY</div>
                      <img src="https://cdn.prod.website-files.com/662fb92f905585b61b12afd8/6822e20a45ee596035504fec_e704a33115e0cf7abf7b069752546c05_episodes.avif" loading="lazy" alt="Episodes" class="bento_episodes-illu" />
                      <a href="/episodes" class="main_button w-button">Join</a>
                      <a href="/episodes" class="bento_link w-inline-block"></a>
                    </div>
                    <div class="bento_songs-wrapper">
                      <div class="bento_songs-title">SONGS</div>
                      <img src="https://cdn.prod.website-files.com/662fb92f905585b61b12afd8/6822ebcf79c38a039c1c39bd_listen_V01_002%201.avif" loading="lazy" alt="Songs" class="bento_songs-illu" />
                      <a href="/listen" class="main_button w-button">Listen</a>
                      <a href="/listen" class="bento_link w-inline-block"></a>
                    </div>
                  </div>
                  <div class="w-layout-grid bento_home-bottom">
                    <div class="bento_home-bottom-left">
                      <div class="bento_apps-wrapper">
                        <div class="bento_apps-title">MINI GAMES</div>
                        <img src="https://cdn.prod.website-files.com/662fb92f905585b61b12afd8/6822e2388e5384b36c484402_efcb08bfb030d243441160222eeba8f1_games.avif" alt="Games" class="bento_apps-illu" />
                        <a href="/play" class="main_button w-button">Play</a>
                        <a href="/play" class="bento_link w-inline-block"></a>
                      </div>
                      <div class="bento_tales-wrapper">
                        <img src="https://cdn.prod.website-files.com/662fb92f905585b61b12afd8/6822edd31bf1c271c2197882_bee95daed17933c2558c1ce0295fa699_tales.webp" loading="lazy" alt="Tales" class="bento_tales-illu" />
                        <div class="bento_tales-title">LIBRARY</div>
                        <a href="/read" class="main_button w-button">Read</a>
                        <a href="/read" class="bento_link w-inline-block"></a>
                      </div>
                    </div>
                    <div class="bento_crafts-wrapper">
                      <div class="bento_crafts-title">QUIZ MAKER</div>
                      <img src="https://cdn.prod.website-files.com/662fb92f905585b61b12afd8/6822e238868fb6a509276e30_a45ff867210361a1cb41ec9d457d4e9ed428fd54.avif" loading="lazy" alt="Crafts" class="bento_crafts-illu" />
                      <a href="/make" class="main_button w-button">Make</a>
                      <a href="/make" class="bento_link w-inline-block"></a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="section_subscribe">
          <div class="padding-global padding-section-large">
            <div class="padding-top-mobile">
              <div class="container-large">
                <div class="form_wrapper w-form">
                  <img src="https://cdn.prod.website-files.com/662fb92f905585b61b12afd8/6638c15f8adcfd1d18bc3f48_faq-illu.webp" loading="lazy" alt="" class="form_illu" />
                  <form id="pocoyo-club-form" name="wf-form-Pocoyo-Club-Form" method="get" class="form">
                    <div class="margin-bottom margin-large">
                      <div class="text-align-center">
                        <p class="faq_title text-color-blue">Feedback for qhun22!</p>
                      </div>
                    </div>
                    <div class="margin-bottom margin-custom1">
                      <div class="form_input-wrapper">
                        <span class="icon-input-user"></span>
                        <input class="form_input w-input" maxlength="256" name="name" placeholder="Your name*" type="text" id="name" required />
                      </div>
                    </div>
                    <div class="margin-bottom margin-custom1">
                      <div class="form_input-wrapper">
                        <span class="icon-input-email"></span>
                        <input class="form_input w-input" maxlength="256" name="email" placeholder="Your email*" type="email" id="email" required />
                      </div>
                    </div>
                    <div class="margin-bottom margin-custom1 relative">
                      <div class="form_input-wrapper is-textarea">
                        <textarea id="feedback" name="Feedback" required placeholder="Your feedback*" class="form_input w-input form_textarea"></textarea>
                      </div>
                    </div>
                    <input type="submit" value="Send Feedback" class="button max-width-full w-button" />
                  </form>
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
    </div>

    <script src="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.12.2/lottie.min.js"></script>
    <script src="/js/toast.js"></script>
    <script src="/js/z1.js"></script>
    <script src="/js/z2.js"></script>
  </body>
</html>`
}

// ── Home — port từ templates/home.html ──
function renderHome(opts: { username: string }): string {
  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="Trang chủ QHUN22" />
    <title>HOME | QHUN22</title>

    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Signika:wght@400;500;600;700&display=swap" rel="stylesheet" />

    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css" />
    <link rel="stylesheet" href="/css/navbar.css" />
    <link rel="stylesheet" href="/css/z1.css" />
    <link rel="stylesheet" href="/css/z2.css" />
    <link rel="stylesheet" href="/css/toast.css" />
    <link rel="stylesheet" href="/css/home.css" />
  </head>
  <body>
    <div class="page-wrapper">
      ${navbarHtml({ loggedIn: true, username: opts.username })}

      <div class="home-notice-overlay" id="home-notice-overlay" hidden></div>
      <aside class="home-notice" id="home-notice" hidden aria-label="Thông báo hướng dẫn">
        <div class="home-notice__header">
          <strong class="home-notice__title">Thông báo mới</strong>
        </div>
        <p class="home-notice__message">
          - Có làm mới có ăn, tự thao tác tạo đề, không hiểu xem hướng dẫn nhé!<br />
          - Khuyến khích sử dụng Pc hoặc Laptop để thao tác setup đề.<br />
          - Sử dụng Mobile để làm bài thôi nhé!
        </p>
        <div class="home-notice__actions">
          <button class="home-notice__btn home-notice__btn--primary" id="home-notice-ok" type="button">Đóng</button>
          <button class="home-notice__btn home-notice__btn--secondary" id="home-notice-snooze" type="button">Đóng 1 giờ</button>
        </div>
      </aside>

      <main class="main-wrapper">
        <div class="padding-global">
          <div class="container-large">
            <section class="learning-section" aria-label="Quản lý học tập">
              <h2 class="learning-title">SETUP</h2>
              <div class="learning-grid">
                <a href="/tao-mon-hoc" class="learning-card" aria-label="Vào phần Tạo Môn">
                  <span class="learning-icon-wrap">
                    <svg class="learning-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M6 4.5h8l4 4v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z" />
                      <path d="M14 4.5V9h4M8 13h8M8 17h8" />
                    </svg>
                  </span>
                  <h3 class="learning-card-title">Tạo Môn Học</h3>
                </a>
                <a href="/tao-de" class="learning-card" aria-label="Vào phần Tạo Đề">
                  <span class="learning-icon-wrap">
                    <svg class="learning-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M7 3.5h7l5 5V18a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2Z" />
                      <path d="M14 3.5V9h5M9 13h6M9 17h6" />
                    </svg>
                  </span>
                  <h3 class="learning-card-title">Tạo Đề</h3>
                </a>
                <a href="#" class="learning-card" aria-label="Vào phần Key">
                  <span class="learning-icon-wrap">
                    <svg class="learning-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <circle cx="8" cy="15" r="4" />
                      <path d="m11 12 8-8M15 6l3 3M18 3l3 3" />
                    </svg>
                  </span>
                  <h3 class="learning-card-title">Key</h3>
                </a>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>

    <script src="/js/toast.js"></script>
    <script src="/js/z1.js"></script>
    <script src="/js/z2.js"></script>
    <script src="/js/home.js"></script>
  </body>
</html>`
}

// ── Tạo môn học — port từ templates/tao-mon-hoc.html ──
function renderTaoMonHoc(): string {
  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="Tạo môn học | QHUN22" />
    <title>TẠO MÔN HỌC | QHUN22</title>

    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Signika:wght@400;500;600;700&display=swap" rel="stylesheet" />

    <link rel="stylesheet" href="/css/navbar.css" />
    <link rel="stylesheet" href="/css/tao-mon-hoc.css" />
    <link rel="stylesheet" href="/css/toast.css" />
    <link rel="stylesheet" href="/css/confirm.css" />
  </head>
  <body class="tiao-mon-hoc-body">
    <header class="smh-header" role="banner">
      <div class="smh-header-inner">
        <a href="/home" class="smh-back" aria-label="Quay lại trang chủ">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </a>
        <h1 class="smh-title">Tạo Môn Học</h1>
      </div>
    </header>

    <main class="smh-main">
      <div class="smh-layout">
        <aside class="smh-col smh-col--create">
          <div class="smh-create-card">
            <div class="smh-count">
              <span class="smh-count-num" id="smh-count-num">0</span>
              <span class="smh-count-label">Môn học</span>
            </div>
            <form id="smh-form" class="smh-form" autocomplete="off" novalidate>
              <label for="smh-input" class="smh-form-label">Chạm bên dưới để thêm!</label>
              <div class="smh-form-row">
                <input id="smh-input" type="text" class="smh-input" placeholder="Ví dụ: Toán học" maxlength="80" autocomplete="off" />
                <button type="submit" class="smh-btn smh-btn--primary">Thêm</button>
              </div>
            </form>
          </div>
        </aside>

        <section class="smh-col smh-col--list" aria-label="Danh sách môn học">
          <div class="smh-list-header">
            <h2 class="smh-section-title">Danh sách môn học</h2>
          </div>
          <ul id="smh-list" class="smh-list"></ul>
          <div id="smh-empty" class="smh-empty" aria-live="polite">
            <div class="smh-empty-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
            </div>
            <p class="smh-empty-title">Chưa có môn học nào</p>
            <p class="smh-empty-sub">Nhập tên môn học bên trái để bắt đầu</p>
          </div>
        </section>
      </div>
    </main>

    <script src="/js/toast.js"></script>
    <script src="/js/confirm.js"></script>
    <script src="/js/tao-mon-hoc.js"></script>
  </body>
</html>`
}

// ── Tạo đề — port từ templates/tao-de.html ──
function renderTaoDe(opts: { initialSubjects: unknown[] }): string {
  const subjectsJson = JSON.stringify(opts.initialSubjects)
  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="Tạo đề trắc nghiệm | QHUN22" />
    <title>TẠO ĐỀ | QHUN22</title>

    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Signika:wght@400;500;600;700&display=swap" rel="stylesheet" />

    <link rel="stylesheet" href="/css/navbar.css" />
    <link rel="stylesheet" href="/css/tao-mon-hoc.css" />
    <link rel="stylesheet" href="/css/tao-de.css" />
    <link rel="stylesheet" href="/css/toast.css" />
    <link rel="stylesheet" href="/css/confirm.css" />
    <link rel="stylesheet" href="/css/exam.css" />
  </head>
  <body class="tiao-mon-hoc-body">
    <header class="smh-header" role="banner">
      <div class="smh-header-inner">
        <a href="/home" class="smh-back" aria-label="Quay lại trang chủ">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </a>
        <h1 class="smh-title">Tạo đề trắc nghiệm</h1>
      </div>
    </header>

    <main class="smh-main">
      <div class="tao-de-page-wrapper">
        <div class="tao-de-grid">
          <div class="left-col">
            <div class="smh-create-card">
              <div class="smh-count">
                <span class="smh-count-num" id="tq-count-num">0</span>
                <span class="smh-count-label">Câu hỏi</span>
              </div>
              <div class="tq-card-title">Tạo đề trắc nghiệm</div>
              <p class="tq-card-sub">Chọn môn học &amp; tuần học, sau đó tải file Word có đáp án đúng được <strong style="color: #dc2626">bôi đỏ</strong>.</p>
            </div>

            <div class="smh-create-card">
              <label class="smh-form-label" for="tq-subject-select">Chọn môn học</label>
              <div class="smh-form-row">
                <select id="tq-subject-select" class="tq-select" aria-label="Chọn môn học">
                  <option value="">-- Chọn môn học --</option>
                </select>
              </div>
            </div>

            <div class="smh-create-card">
              <label class="smh-form-label" for="tq-week-select">Chọn tuần học</label>
              <div class="smh-form-row">
                <select id="tq-week-select" class="tq-select" aria-label="Chọn tuần học">
                  <option value="">-- Chọn tuần học --</option>
                </select>
              </div>
              <p class="tq-hint" id="tq-week-hint">Chưa có tuần học. Vào <a href="/tao-mon-hoc">Tạo Môn Học</a> để thêm.</p>
            </div>

            <div class="smh-create-card">
              <label class="smh-form-label">Tải file Word trắc nghiệm</label>
              <div class="tq-dropzone" id="tq-dropzone" role="button" tabindex="0" aria-label="Kéo thả hoặc nhấn để chọn file Word">
                <div class="tq-dropzone-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="12" y1="18" x2="12" y2="12" />
                    <line x1="9" y1="15" x2="15" y2="15" />
                  </svg>
                </div>
                <div class="tq-dropzone-text">
                  <p class="tq-dropzone-title">Kéo thả file Word vào đây</p>
                  <p class="tq-dropzone-sub">hoặc <span class="tq-link">chọn từ máy</span></p>
                </div>
                <input type="file" id="tq-file-input" accept=".docx" hidden />
              </div>
              <div class="tq-file-info" id="tq-file-info" hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span class="tq-file-name" id="tq-file-name"></span>
                <button type="button" class="tq-file-remove" id="tq-file-remove" aria-label="Xóa file" title="Xóa file">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            <div class="smh-create-card">
              <div class="tq-actions">
                <button type="button" class="smh-btn smh-btn--primary" id="tq-btn-parse" disabled>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Tạo câu hỏi
                </button>
                <button type="button" class="smh-btn smh-btn--ghost" id="tq-btn-clear" disabled>Xóa hết</button>
              </div>
              <div class="tq-actions tq-actions--bottom">
                <button type="button" class="smh-btn smh-btn--ghost" id="tq-btn-add-question">+ Thêm câu hỏi</button>
                <button type="button" class="smh-btn smh-btn--primary smh-btn--share" id="tq-btn-share" disabled>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                  Chuyển tiếp
                </button>
              </div>
            </div>
          </div>

          <div class="right-col">
            <div class="tq-content-header">
              <h2 class="tq-section-title">Câu hỏi trắc nghiệm</h2>
              <span class="tq-qstats" id="tq-toolbar-stat" hidden>
                <span class="tq-stat tq-stat--single" id="tq-stat-single-wrap" title="Chỉ 1 đáp án đúng" hidden><span class="tq-stat-num" id="tq-stat-single">0</span> một đáp án</span>
                <span class="tq-stat tq-stat--multi" id="tq-stat-multiple-wrap" title="Nhiều đáp án đúng" hidden><span class="tq-stat-num" id="tq-stat-multiple">0</span> nhiều đáp án</span>
                <span class="tq-stat tq-stat--tf" id="tq-stat-tf-wrap" title="Đúng / Sai" hidden><span class="tq-stat-num" id="tq-stat-tf">0</span> đúng/sai</span>
                <span class="tq-stat tq-stat--fill" id="tq-stat-fill-wrap" title="Điền từ vào chỗ trống" hidden><span class="tq-stat-num" id="tq-stat-fill">0</span> điền từ</span>
                <span class="tq-stat tq-stat--order" id="tq-stat-order-wrap" title="Sắp xếp từ" hidden><span class="tq-stat-num" id="tq-stat-order">0</span> sắp xếp</span>
                <span class="tq-stat tq-stat--drag" id="tq-stat-drag-wrap" title="Kéo thả đáp án" hidden><span class="tq-stat-num" id="tq-stat-drag">0</span> kéo thả</span>
                <span class="tq-stat tq-stat--drag" id="tq-stat-group-wrap" title="Phân loại đáp án theo nhóm" hidden><span class="tq-stat-num" id="tq-stat-group">0</span> phân nhóm</span>
                <span class="tq-stat tq-stat--warn" id="tq-stat-unknown-wrap" title="Chưa xác định loại"><span class="tq-stat-num" id="tq-stat-unknown">0</span> chưa rõ</span>
                <span class="tq-stat tq-stat--duplicate" id="tq-stat-duplicate-wrap" title="Câu trùng lặp"><span class="tq-stat-num" id="tq-stat-duplicate">0</span> trùng</span>
                <span class="tq-stat tq-stat--ok" title="Hợp lệ (≥2 option + có đáp án)"><span class="tq-stat-num" id="tq-stat-ok">0</span> hợp lệ</span>
                <span class="tq-stat tq-stat--warn" id="tq-stat-warn-wrap" hidden><span class="tq-stat-num" id="tq-stat-warn">0</span> cảnh báo</span>
              </span>
            </div>
            <div class="tq-warnings" id="tq-warnings" hidden></div>
            <ul id="tq-list" class="tq-list"></ul>
            <div id="tq-empty" class="smh-empty" aria-live="polite">
              <div class="smh-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6M8 13h8M8 17h5" />
                </svg>
              </div>
              <p class="smh-empty-title">Chưa có câu hỏi nào</p>
              <p class="smh-empty-sub">Kéo thả file Word (đáp án đúng đã được bôi đỏ) vào khung bên trái, sau đó nhấn <strong>Parse câu hỏi</strong> để bắt đầu.</p>
            </div>
          </div>
        </div>
      </div>
    </main>

    <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
    <script src="/js/toast.js"></script>
    <script src="/js/confirm.js"></script>
    <script>window.__INITIAL_SUBJECTS__ = ${subjectsJson};</script>
    <script src="/js/tao-de.js"></script>
  </body>
</html>`
}

// ── Tạo đề cấu hình — port từ templates/tao-de-cau-hinh.html ──
function renderTaoDeCauHinh(opts: { quizCode: string }): string {
  const backUrl = opts.quizCode ? `/tao-de?quiz=${encodeURIComponent(opts.quizCode)}` : '/tao-de'
  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="Cấu hình bài thi | QHUN22" />
    <title>CẤU HÌNH BÀI THI | QHUN22</title>

    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Signika:wght@400;500;600;700&display=swap" rel="stylesheet" />

    <link rel="stylesheet" href="/css/navbar.css" />
    <link rel="stylesheet" href="/css/tao-mon-hoc.css" />
    <link rel="stylesheet" href="/css/toast.css" />
    <link rel="stylesheet" href="/css/confirm.css" />
    <link rel="stylesheet" href="/css/tao-de-cau-hinh.css" />
  </head>
  <body class="tiao-mon-hoc-body">
    <header class="smh-header" role="banner">
      <div class="smh-header-inner">
        <a href="${backUrl}" class="smh-back" aria-label="Quay lại Tạo đề">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </a>
        <h1 class="smh-title">Cấu hình bài thi</h1>
      </div>
    </header>

    <main class="smh-main">
      <div class="cauhinh-wrapper">
        <div class="smh-create-card">
          <div class="smh-count">
            <span class="smh-count-num" id="cauhinh-count-ques">0</span>
            <span class="smh-count-label">Câu hỏi</span>
          </div>
          <div class="cauhinh-info">
            <p class="cauhinh-info-subject" id="cauhinh-subject">-</p>
            <p class="cauhinh-info-week" id="cauhinh-week">-</p>
          </div>
        </div>

        <div class="smh-create-card">
          <h2 class="cauhinh-section-title">Cài đặt chung</h2>

          <div class="cauhinh-row">
            <label class="cauhinh-label" for="cauhinh-duration">Thời gian làm bài</label>
            <div class="cauhinh-input-group">
              <input type="text" id="cauhinh-duration" class="smh-input" value="30:00" placeholder="mm:ss" maxlength="5" />
              <span class="cauhinh-input-hint">mm:ss</span>
            </div>
          </div>

          <div class="cauhinh-row">
            <label class="cauhinh-label">Trạng thái liên kết</label>
            <div class="cauhinh-toggle-row">
              <button type="button" class="cauhinh-toggle" id="cauhinh-active-toggle" role="switch" aria-checked="true">
                <span class="cauhinh-toggle-track"><span class="cauhinh-toggle-thumb"></span></span>
                <span class="cauhinh-toggle-label" id="cauhinh-active-label">Hoạt động</span>
              </button>
            </div>
          </div>

          <div class="cauhinh-row">
            <label class="cauhinh-label">KeyUsername</label>
            <div class="cauhinh-toggle-row">
              <button type="button" class="cauhinh-toggle" id="cauhinh-keyusername-toggle" role="switch" aria-checked="false">
                <span class="cauhinh-toggle-track"><span class="cauhinh-toggle-thumb"></span></span>
                <span class="cauhinh-toggle-label" id="cauhinh-keyusername-label">Tắt</span>
              </button>
            </div>
            <p class="cauhinh-hint" id="cauhinh-keyusername-hint">
              Tắt: Ai cũng có thể làm bài sau khi đăng nhập.<br />
              Bật: Chỉ người được thêm vào danh sách mới được làm.
            </p>
          </div>

          <div class="cauhinh-row">
            <label class="cauhinh-label">Auto đảo đề</label>
            <div class="cauhinh-toggle-row">
              <button type="button" class="cauhinh-toggle" id="cauhinh-shuffle-toggle" role="switch" aria-checked="true">
                <span class="cauhinh-toggle-track"><span class="cauhinh-toggle-thumb"></span></span>
                <span class="cauhinh-toggle-label" id="cauhinh-shuffle-label">Bật</span>
              </button>
            </div>
            <p class="cauhinh-hint">Mỗi lượt làm sẽ đảo thứ tự câu hỏi và thứ tự đáp án. Mặc định: bật.</p>
          </div>

          <div class="cauhinh-row">
            <label class="cauhinh-label">Hiển thị đáp án</label>
            <div class="cauhinh-toggle-row">
              <button type="button" class="cauhinh-toggle" id="cauhinh-feedback-toggle" role="switch" aria-checked="false">
                <span class="cauhinh-toggle-track"><span class="cauhinh-toggle-thumb"></span></span>
                <span class="cauhinh-toggle-label" id="cauhinh-feedback-label">Sau khi nộp bài</span>
              </button>
            </div>
            <p class="cauhinh-hint">Tắt: làm hết rồi nộp mới xem đáp án. Bật: trả lời đến đâu xem kết quả đến đó.</p>
          </div>
        </div>

        <div class="smh-create-card" id="cauhinh-keyusername-section" style="display: none">
          <h2 class="cauhinh-section-title">Danh sách KeyUsername</h2>
          <div class="cauhinh-add-user">
            <input type="text" id="cauhinh-username-input" class="smh-input" placeholder="Nhập username cần thêm..." maxlength="50" />
            <button type="button" class="smh-btn smh-btn--primary" id="cauhinh-add-user-btn">Thêm</button>
          </div>
          <ul class="cauhinh-user-list" id="cauhinh-user-list">
            <li class="cauhinh-user-empty" id="cauhinh-user-empty">Chưa có ai được thêm vào danh sách.</li>
          </ul>
        </div>

        <div class="smh-create-card">
          <h2 class="cauhinh-section-title">Liên kết làm bài</h2>
          <div class="cauhinh-link-row">
            <input type="text" id="cauhinh-link-input" class="smh-input" readonly value="" placeholder="Liên kết sẽ hiển thị sau khi lưu" />
            <button type="button" class="smh-btn smh-btn--primary" id="cauhinh-copy-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy
            </button>
          </div>
        </div>

        <div class="cauhinh-actions">
          <a href="/home" class="smh-btn smh-btn--ghost">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            Home
          </a>
          <button type="button" class="smh-btn smh-btn--primary" id="cauhinh-save-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            Lưu thay đổi
          </button>
        </div>
      </div>
    </main>

    <script>window.__QUIZ_CODE__ = "${opts.quizCode}";</script>
    <script src="/js/toast.js"></script>
    <script src="/js/confirm.js"></script>
    <script src="/js/tao-de-cau-hinh.js"></script>
  </body>
</html>`
}

function safeJson<T>(str: string, fallback: T): T {
  try { return JSON.parse(str) } catch { return fallback }
}
