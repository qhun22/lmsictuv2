import { Hono } from 'hono'
import { trimTrailingSlash } from 'hono/trailing-slash'
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
  ASSETS: Fetcher
}

const app = new Hono<{ Bindings: Env }>()

// Strip trailing slashes so /api/subjects/ → /api/subjects
app.use('*', trimTrailingSlash())

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
