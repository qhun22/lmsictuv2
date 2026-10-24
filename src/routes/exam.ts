// Port từ django/lmsictu/views.py: exam_page, exam_result_page, api_submit_exam

import { Hono } from 'hono'
import type { Env } from '../index'
import { getSession, quizUserHasAccess } from '../utils/auth'
import { scoreExam } from '../utils/scoring'

export const examRoutes = new Hono<{ Bindings: Env }>()

type QuizRow = {
  id: number; code: string; title: string; subject: string; is_active: number
  questions: string; duration_seconds: number
  has_key_username: number; key_usernames: string
  auto_shuffle: number; show_answers_immediately: number
}

type AttemptRow = {
  id: number; quiz_id: number; user_id: number | null; session_key: string
  answers: string; results: string; score: number | null; total: number
  quiz_code: string; quiz_title: string; quiz_subject: string; quiz_questions: string; quiz_duration_seconds: number
}

// ── GET /e/:code → exam_page ──
examRoutes.get('/e/:code', async (c) => {
  const session = await getSession(c)
  if (!session) {
    const next = encodeURIComponent(new URL(c.req.url).pathname)
    return c.redirect(`/login?next=${next}`)
  }

  const code = c.req.param('code')
  const quiz = await c.env.DB.prepare('SELECT * FROM quiz WHERE code = ?')
    .bind(code).first<QuizRow>()
  if (!quiz) return c.html(renderError('Đề thi không tồn tại hoặc đã bị xóa.'), 404)
  if (!quiz.is_active) return c.html(renderError('Bài thi đang tạm ngưng để bảo trì. Vui lòng quay lại sau.'), 503)
  if (!quizUserHasAccess(quiz, session.username)) {
    return c.redirect('/home')
  }

  const questions = safeJson<unknown[]>(quiz.questions, [])
  const autoShuffle = quiz.auto_shuffle !== 0
  const questionOrder = autoShuffle ? shuffleIndices(questions.length) : questions.map((_, i) => i)
  return c.html(renderExamPage({
    quiz, quizJson: JSON.stringify(questions),
    durationSeconds: quiz.duration_seconds,
    resultJson: 'null',
    pageTitle: quiz.title || `Đề ${quiz.code}`,
    questionOrder,
    showAnswersImmediately: Boolean(quiz.show_answers_immediately),
    username: session.username,
  }))
})

// ── GET /result/:code/:attempt_id → exam_result_page ──
examRoutes.get('/result/:code/:attempt_id', async (c) => {
  const session = await getSession(c)
  const code = c.req.param('code')
  const attemptId = Number(c.req.param('attempt_id'))

  const attempt = await c.env.DB.prepare(`
    SELECT a.*, q.code as quiz_code, q.title as quiz_title, q.subject as quiz_subject,
           q.questions as quiz_questions, q.duration_seconds as quiz_duration_seconds
    FROM attempt a
    JOIN quiz q ON a.quiz_id = q.id
    WHERE a.id = ? AND q.code = ?
  `).bind(attemptId, code).first<AttemptRow>()

  if (!attempt) return c.html(renderError('Không tìm thấy kết quả bài làm.'), 404)

  const sameUser = attempt.user_id && session && attempt.user_id === session.userId
  const sessionKey = c.req.header('Cookie')?.match(/session_key=([^;]+)/)?.[1] ?? ''
  const sameSession = attempt.session_key && attempt.session_key === sessionKey

  if (!sameUser && !sameSession) {
    return c.html(renderError('Bạn không có quyền xem kết quả bài làm này.'), 403)
  }

  const questions = safeJson<unknown[]>(attempt.quiz_questions, [])
  const resultJson = JSON.stringify({
    success: true,
    score: attempt.score,
    correct: safeJson<Array<{correct: boolean}>>(attempt.results, []).filter((r) => r.correct).length,
    total: attempt.total,
    results: safeJson(attempt.results, []),
  })

  return c.html(renderExamPage({
    quiz: { code, title: attempt.quiz_title, subject: attempt.quiz_subject ?? '', duration_seconds: attempt.quiz_duration_seconds, is_active: 1, has_key_username: 0, key_usernames: '[]', questions: attempt.quiz_questions, id: attempt.quiz_id, auto_shuffle: 0, show_answers_immediately: 0 },
    quizJson: JSON.stringify(questions),
    durationSeconds: attempt.quiz_duration_seconds,
    resultJson,
    pageTitle: `Kết quả - ${attempt.quiz_title || code}`,
    questionOrder: questions.map((_, i) => i),
    showAnswersImmediately: false,
    username: session?.username ?? 'Username',
  }))
})

// ── POST /api/submit-exam/:code → api_submit_exam ──
examRoutes.post('/api/submit-exam/:code', async (c) => {
  const session = await getSession(c)
  const code = c.req.param('code')

  const quiz = await c.env.DB.prepare('SELECT * FROM quiz WHERE code = ?')
    .bind(code).first<QuizRow>()
  if (!quiz) return c.json({ success: false, message: 'Đề thi không tồn tại.' }, 404)

  if (session && !quizUserHasAccess(quiz, session.username)) {
    return c.json({ success: false, message: 'KeyUsername chưa được cấp quyền cho bài thi này.' }, 403)
  }

  let data: { answers?: Record<string, unknown> }
  try { data = await c.req.json() } catch { return c.json({ success: false, message: 'Dữ liệu không hợp lệ.' }, 400) }

  const answers = data.answers ?? {}
  const questions = safeJson<Array<Record<string, unknown>>>(quiz.questions, [])

  const { results, correct, total, score } = scoreExam(questions, answers)

  // Session key từ cookie (tương đương request.session.session_key)
  const cookieHeader = c.req.header('Cookie') ?? ''
  const sessionKey = cookieHeader.match(/session_key=([^;]+)/)?.[1] ?? crypto.randomUUID()

  const attempt = await c.env.DB.prepare(`
    INSERT INTO attempt (quiz_id, session_key, user_id, answers, results, score, total, submitted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    RETURNING id
  `).bind(
    quiz.id, sessionKey, session?.userId ?? null,
    JSON.stringify(answers), JSON.stringify(results), score, total
  ).first<{ id: number }>()

  const origin = new URL(c.req.url).origin
  return c.json({
    success: true, score, correct, total, results,
    result_url: `${origin}/result/${code}/${attempt!.id}`,
  })
})

// ── HTML render ──
function renderExamPage(opts: {
  quiz: Pick<QuizRow, 'code' | 'title' | 'subject' | 'duration_seconds' | 'is_active' | 'has_key_username' | 'key_usernames' | 'id' | 'questions' | 'auto_shuffle' | 'show_answers_immediately'>
  quizJson: string
  durationSeconds: number
  resultJson: string
  pageTitle: string
  questionOrder: number[]
  showAnswersImmediately: boolean
  username: string
}): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const subject = opts.quiz.subject ?? ''
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1, user-scalable=no" />
  <title>${esc(opts.pageTitle)} | QHUN22</title>
  <meta name="description" content="Bài thi trắc nghiệm QHUN22. Đăng nhập để bắt đầu làm bài." />
  <meta property="og:title" content="${esc(opts.pageTitle)} | QHUN22" />
  <meta property="og:description" content="Bài thi trắc nghiệm QHUN22. Đăng nhập để bắt đầu làm bài." />
  <meta property="og:type" content="website" />
  <meta name="csrf-token" content="" />
  <link rel="stylesheet" href="/css/exam.css" />
  <link rel="stylesheet" href="/css/toast.css" />
</head>
<body>
  <div class="exam-container" id="exam-container">
    <header class="exam-header">
      <span class="exam-user">${esc(opts.username)}</span>
      <span class="exam-timer" id="exam-timer">00:00</span>
      <a class="exam-exit" href="/">Thoát</a>
    </header>

    <main class="exam-content">
      <div class="question-card" id="question-card">
        <div class="question-header">
          <span class="question-num" id="question-num">Câu 1</span>
          <span class="question-type" id="question-type">1 đáp án đúng</span>
        </div>
        <p class="question-text" id="question-text"></p>
        <div class="answer-list" id="answer-list"></div>
      </div>

      <div class="exam-nav">
        <span class="exam-subject">Môn học${subject ? ': ' + esc(subject) : ''}</span>
        <button type="button" class="btn-nav btn-nav-menu" id="btn-prev" aria-label="Mở danh sách câu hỏi" title="Danh sách câu hỏi">☰</button>
        <div class="nav-dots" id="nav-dots"></div>
        <button type="button" class="btn-nav btn-nav-next" id="btn-next" aria-label="Câu tiếp">→</button>
        <button type="button" class="btn-nop" id="btn-submit">Nộp bài</button>
      </div>
    </main>
  </div>

  <div class="question-drawer-backdrop" id="question-drawer-backdrop"></div>
  <aside class="question-drawer" id="question-drawer" aria-hidden="true" aria-label="Danh sách câu hỏi">
    <div class="question-drawer-header">
      <h2>Danh sách câu hỏi</h2>
      <button type="button" class="question-drawer-close" id="question-drawer-close" aria-label="Đóng danh sách câu hỏi">×</button>
    </div>
    <div class="question-drawer-subject">
      <span class="question-drawer-subject-label">Môn học</span>
      <strong>${subject ? esc(subject) : 'Chưa xác định'}</strong>
    </div>
    <div class="question-drawer-list" id="question-drawer-list"></div>
  </aside>

  <div class="modal-overlay" id="modal-submit" hidden>
    <div class="modal-box">
      <h2 class="modal-title">Nộp bài?</h2>
      <p class="modal-text">Bạn đã trả lời <strong id="modal-answered">0</strong>/<span id="modal-total">${opts.questionOrder.length}</span> câu.</p>
      <div class="modal-actions">
        <button type="button" class="btn-cancel" id="modal-cancel">Hủy</button>
        <button type="button" class="btn-confirm" id="modal-confirm">Nộp ngay</button>
      </div>
    </div>
  </div>

  <div class="touch-choice-overlay" id="touch-choice-overlay" hidden>
    <div class="touch-choice-box" role="dialog" aria-modal="true" aria-labelledby="touch-choice-title">
      <h2 class="touch-choice-title" id="touch-choice-title">Chọn vị trí</h2>
      <div class="touch-choice-options" id="touch-choice-options"></div>
      <button type="button" class="touch-choice-cancel" id="touch-choice-cancel">Hủy</button>
    </div>
  </div>

  <script>
    window.__QUIZ_DATA__ = ${opts.quizJson};
    window.__QUIZ_QUESTION_ORDER__ = ${JSON.stringify(opts.questionOrder)};
    window.__QUIZ_CODE__ = "${esc(opts.quiz.code)}";
    window.__QUIZ_DURATION__ = ${opts.durationSeconds};
    window.__SHOW_ANSWERS_IMMEDIATELY__ = ${opts.showAnswersImmediately};
    window.__RESULT_DATA__ = ${opts.resultJson};
  </script>
  <script src="/js/toast.js"></script>
  <script src="/js/exam.js"></script>
</body>
</html>`
}

function renderError(message: string): string {
  return `<!doctype html>
<html lang="vi">
<head><meta charset="UTF-8" /><title>Lỗi — QHUN22</title>
<link rel="stylesheet" href="/css/navbar.css" /></head>
<body><div class="page-wrapper">
  <div class="error-page"><p class="error-message">${message}</p>
  <a href="/home" class="button">Về trang chủ</a></div>
</div></body></html>`
}

function safeJson<T>(str: string, fallback: T): T {
  try { return JSON.parse(str) } catch { return fallback }
}

function shuffleIndices(length: number): number[] {
  const arr = Array.from({ length }, (_, i) => i)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
