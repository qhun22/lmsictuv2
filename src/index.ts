import { Hono } from 'hono'
import { serveStatic } from 'hono/cloudflare-workers'
import { authRoutes } from './routes/auth'
import { examRoutes } from './routes/exam'
import { subjectRoutes } from './routes/subject'
import { weekRoutes } from './routes/week'
import { quizRoutes } from './routes/quiz'
import { pageRoutes } from './routes/pages'
import { authMiddleware } from './middleware/auth'

export type Env = {
  DB: D1Database
  SECRET_KEY: string
}

const app = new Hono<{ Bindings: Env }>()

// Serve static assets (/assets/*)
app.use('/assets/*', serveStatic({ root: './' }))

// Auth middleware
app.use('*', authMiddleware)

// Page routes (HTML)
app.route('/', pageRoutes)
app.route('/', authRoutes)
app.route('/', examRoutes)

// API routes
app.route('/api', quizRoutes)
app.route('/api', subjectRoutes)
app.route('/api', weekRoutes)

export default app
