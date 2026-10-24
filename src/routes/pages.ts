import { Hono } from 'hono'
import type { Env } from '../index'
import { getSession } from '../utils/auth'

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

// ── Navbar (port từ templates/includes/navbar.html) ──
function navbar(opts: { loggedIn: boolean; username?: string }): string {
  const homeUrl = opts.loggedIn ? '/home' : '/'
  const watchBlock = opts.loggedIn
    ? `<a href="/account" class="watch-link w-inline-block">
        <div class="watch_flex-link">
          <div class="watch_text text-style-allcaps">${opts.username}</div>
        </div>
      </a>`
    : `<a href="/login" class="watch-link w-inline-block">
        <div class="watch_flex-link">
          <img src="https://cdn.prod.website-files.com/662fb92f905585b61b12afd8/66436f018b6d06434419b591_play-icon.svg"
               loading="lazy" width="24" alt="" class="button_icon" />
          <div class="watch_text text-style-allcaps">START</div>
        </div>
      </a>`

  const accountLinks = opts.loggedIn
    ? `<a href="/account" class="navbar_menu-content-link">Tài khoản.</a>
       <a href="/logout" class="navbar_menu-content-link">Đăng xuất.</a>`
    : `<a href="/login" class="navbar_menu-content-link">Đăng nhập.</a>
       <a href="/register" class="navbar_menu-content-link">Đăng ký.</a>
       <a href="/forgot-password" class="navbar_menu-content-link">Quên mật khẩu.</a>`

  const mobileAccountLinks = opts.loggedIn
    ? `<a href="/account" class="navbar_mobile-sublink js-mobile-nav-link"><span class="navbar_mobile-sublink-dot"></span><span>Tài khoản</span></a>
       <a href="/logout" class="navbar_mobile-sublink js-mobile-nav-link"><span class="navbar_mobile-sublink-dot"></span><span>Đăng xuất</span></a>`
    : `<a href="/login" class="navbar_mobile-sublink js-mobile-nav-link"><span class="navbar_mobile-sublink-dot"></span><span>Đăng nhập</span></a>
       <a href="/register" class="navbar_mobile-sublink js-mobile-nav-link"><span class="navbar_mobile-sublink-dot"></span><span>Đăng ký</span></a>
       <a href="/forgot-password" class="navbar_mobile-sublink js-mobile-nav-link"><span class="navbar_mobile-sublink-dot"></span><span>Quên mật khẩu</span></a>`

  const mobileHomeUrl = opts.loggedIn ? '/home' : '/login'

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
      <a href="${homeUrl}" aria-current="page" class="navbar_logo-link w-nav-brand w--current">
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
            <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <div class="navbar_mobile-body">
        <nav class="navbar_mobile-nav" aria-label="Menu chính">
          <a href="${mobileHomeUrl}" class="navbar_mobile-link js-mobile-nav-link">
            <span class="navbar_mobile-link-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
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
                ${mobileAccountLinks}
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
      <div class="navbar_menu-content navbar_menu-content-desktop-only">
        <div class="navbar_menu-content-left">
          <div class="navbar_menu-content-fixed">
            <div class="navbar_dropdown w-dropdown">
              <div class="navbar_dropdown-toggle w-dropdown-toggle">
                <a href="#" class="display-flex-h-left-center is-tiny w-inline-block navbar_top-link">
                  <span class="icon-arrow"></span>
                  <div class="heading-style-h5">Tài khoản</div>
                </a>
              </div>
              <nav class="navbar_dropdown-list w-dropdown-list">
                <div class="navbar_menu-content-wrapper">
                  ${accountLinks}
                </div>
              </nav>
            </div>
          </div>
          <div class="navbar_menu-content-fixed">
            <div class="navbar_dropdown w-dropdown">
              <div class="navbar_dropdown-toggle w-dropdown-toggle">
                <a href="#" class="display-flex-h-left-center is-tiny w-inline-block navbar_top-link">
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
                <a href="#" class="display-flex-h-left-center is-tiny w-inline-block navbar_top-link">
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
                <a href="#" class="display-flex-h-left-center is-tiny w-inline-block navbar_top-link">
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
                <a href="#" class="display-flex-h-left-center is-tiny w-inline-block navbar_top-link">
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
                <a href="#" class="display-flex-h-left-center is-tiny w-inline-block navbar_top-link">
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
          <img src="https://cdn.prod.website-files.com/662fb92f905585b61b12afd8/6822c6cdf50740203b81634b_pocoyo-songs.avif"
               loading="lazy" width="284" alt="Pocoyo songs" class="navbar_pocoyo-songs-image" />
        </a>
      </div>
      <div class="z-index-2 navbar_bottom-desktop-only">
        <div class="navbar_bottom">
          <div class="navbar_flag-component hide-tablet">
            <div class="w-dropdown">
              <div class="navbar_flag-wrapper w-dropdown-toggle">
                <div>VIE</div>
                <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 900 600'%3E%3Crect width='900' height='600' fill='%23da251d'/%3E%3Cpolygon points='450,150 485,258 608,258 508,326 546,434 450,380 354,434 392,326 292,258 415,258' fill='%23ffff00'/%3E%3C/svg%3E"
                     loading="lazy" alt="Vietnam flag" class="navbar_flag-image" />
              </div>
            </div>
          </div>
          <div class="w-layout-grid navbar_social-list">
            <a href="https://www.instagram.com/pocoyo/" target="_blank" class="w-inline-block">
              <div class="footer_social-icon w-embed">
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M10.4001 2.66669H21.6001C25.8667 2.66669 29.3334 6.13335 29.3334 10.4V21.6C29.3334 23.651 28.5187 25.618 27.0684 27.0683C25.6181 28.5186 23.6511 29.3334 21.6001 29.3334H10.4001C6.13341 29.3334 2.66675 25.8667 2.66675 21.6V10.4C2.66675 8.34901 3.48151 6.38201 4.93179 4.93173C6.38207 3.48145 8.34907 2.66669 10.4001 2.66669ZM10.1334 5.33335C8.86037 5.33335 7.63948 5.83907 6.7393 6.73924C5.83913 7.63942 5.33341 8.86031 5.33341 10.1334V21.8667C5.33341 24.52 7.48008 26.6667 10.1334 26.6667H21.8667C23.1398 26.6667 24.3607 26.161 25.2609 25.2608C26.161 24.3606 26.6667 23.1397 26.6667 21.8667V10.1334C26.6667 7.48002 24.5201 5.33335 21.8667 5.33335H10.1334ZM23.0001 7.33335C23.4421 7.33335 23.866 7.50895 24.1786 7.82151C24.4912 8.13407 24.6667 8.55799 24.6667 9.00002C24.6667 9.44205 24.4912 9.86597 24.1786 10.1785C23.866 10.4911 23.4421 10.6667 23.0001 10.6667C22.5581 10.6667 22.1341 10.4911 21.8216 10.1785C21.509 9.86597 21.3334 9.44205 21.3334 9.00002C21.3334 8.55799 21.509 8.13407 21.8216 7.82151C22.1341 7.50895 22.5581 7.33335 23.0001 7.33335ZM16.0001 9.33335C17.7682 9.33335 19.4639 10.0357 20.7141 11.286C21.9644 12.5362 22.6667 14.2319 22.6667 16C22.6667 17.7681 21.9644 19.4638 20.7141 20.7141C19.4639 21.9643 17.7682 22.6667 16.0001 22.6667C14.232 22.6667 12.5363 21.9643 11.286 20.7141C10.0358 19.4638 9.33341 17.7681 9.33341 16C9.33341 14.2319 10.0358 12.5362 11.286 11.286C12.5363 10.0357 14.232 9.33335 16.0001 9.33335ZM16.0001 12C14.9392 12 13.9218 12.4214 13.1717 13.1716C12.4215 13.9217 12.0001 14.9392 12.0001 16C12.0001 17.0609 12.4215 18.0783 13.1717 18.8284C13.9218 19.5786 14.9392 20 16.0001 20C17.0609 20 18.0784 19.5786 18.8285 18.8284C19.5787 18.0783 20.0001 17.0609 20.0001 16C20.0001 14.9392 19.5787 13.9217 18.8285 13.1716C18.0784 12.4214 17.0609 12 16.0001 12Z" fill="currentColor"/>
                </svg>
              </div>
            </a>
            <a href="https://www.facebook.com/pocoyo/" target="_blank" class="w-inline-block">
              <div class="footer_social-icon w-embed">
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M29.3334 16C29.3334 8.64002 23.3601 2.66669 16.0001 2.66669C8.64008 2.66669 2.66675 8.64002 2.66675 16C2.66675 22.4534 7.25341 27.8267 13.3334 29.0667V20H10.6667V16H13.3334V12.6667C13.3334 10.0934 15.4267 8.00002 18.0001 8.00002H21.3334V12H18.6667C17.9334 12 17.3334 12.6 17.3334 13.3334V16H21.3334V20H17.3334V29.2667C24.0667 28.6 29.3334 22.92 29.3334 16Z" fill="currentColor"/>
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

// ── Index (landing) — port từ templates/index.html ──
function renderIndex(): string {
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>QHUN22</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Signika:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css" />
  <link rel="stylesheet" href="/css/navbar.css" />
  <link rel="stylesheet" href="/css/z1.css" />
  <link rel="stylesheet" href="/css/z2.css" />
  <link rel="stylesheet" href="/css/toast.css" />
</head>
<body>
  <div class="page-wrapper">
    ${navbar({ loggedIn: false })}
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
    ${navbar({ loggedIn: true, username: opts.username })}
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
                    <path d="M6 4.5h8l4 4v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z"/>
                    <path d="M14 4.5V9h4M8 13h8M8 17h8"/>
                  </svg>
                </span>
                <h3 class="learning-card-title">Tạo Môn Học</h3>
              </a>
              <a href="/tao-de" class="learning-card" aria-label="Vào phần Tạo Đề">
                <span class="learning-icon-wrap">
                  <svg class="learning-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M7 3.5h7l5 5V18a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2Z"/>
                    <path d="M14 3.5V9h5M9 13h6M9 17h6"/>
                  </svg>
                </span>
                <h3 class="learning-card-title">Tạo Đề</h3>
              </a>
              <a href="#" class="learning-card" aria-label="Vào phần Key">
                <span class="learning-icon-wrap">
                  <svg class="learning-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <circle cx="8" cy="15" r="4"/>
                    <path d="m11 12 8-8M15 6l3 3M18 3l3 3"/>
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
          <path d="m15 18-6-6 6-6"/>
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
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
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
          <path d="m15 18-6-6 6-6"/>
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
            <p class="tq-card-sub">Chọn môn học & tuần học, sau đó tải file Word có đáp án đúng được <strong style="color:#dc2626">bôi đỏ</strong>.</p>
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
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="12" y1="18" x2="12" y2="12"/>
                  <line x1="9" y1="15" x2="15" y2="15"/>
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
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <span class="tq-file-name" id="tq-file-name"></span>
              <button type="button" class="tq-file-remove" id="tq-file-remove" aria-label="Xóa file" title="Xóa file">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="smh-create-card">
            <div class="tq-actions">
              <button type="button" class="smh-btn smh-btn--primary" id="tq-btn-parse" disabled>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Tạo câu hỏi
              </button>
              <button type="button" class="smh-btn smh-btn--ghost" id="tq-btn-clear" disabled>Xóa hết</button>
            </div>
            <div class="tq-actions tq-actions--bottom">
              <button type="button" class="smh-btn smh-btn--ghost" id="tq-btn-add-question">+ Thêm câu hỏi</button>
              <button type="button" class="smh-btn smh-btn--primary smh-btn--share" id="tq-btn-share" disabled>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
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
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <path d="M14 2v6h6M8 13h8M8 17h5"/>
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
          <path d="m15 18-6-6 6-6"/>
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
      <div class="smh-create-card" id="cauhinh-keyusername-section" style="display:none">
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
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            Copy
          </button>
        </div>
      </div>
      <div class="cauhinh-actions">
        <a href="/home" class="smh-btn smh-btn--ghost">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
          Home
        </a>
        <button type="button" class="smh-btn smh-btn--primary" id="cauhinh-save-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
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
