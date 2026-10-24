// Tương đương django/lmsictu/models.py
// Dùng Cloudflare D1 (SQLite)

export type User = {
  id: number
  username: string
  email: string
  password_hash: string
  is_active: boolean
  created_at: string
}

export type AccountProfile = {
  id: number
  user_id: number
  updated_at: string
}

export type Subject = {
  id: number
  name: string
  creator_id: number | null
  created_at: string
  updated_at: string
}

export type Week = {
  id: number
  subject_id: number
  name: string
  topics: string        // JSON array
  link: string
  quiz_code: string
  active: boolean
  created_at: string
}

export type Quiz = {
  id: number
  code: string          // 8 ký tự hex, unique
  title: string
  subject: string
  week_index: number | null
  is_active: boolean
  creator_id: number | null
  questions: string     // JSON array
  duration_seconds: number
  has_key_username: boolean
  key_usernames: string // JSON array
  created_at: string
}

export type Attempt = {
  id: number
  quiz_id: number
  session_key: string
  user_id: number | null
  answers: string       // JSON object {idx: label}
  results: string       // JSON array
  score: number | null
  total: number
  started_at: string
  submitted_at: string | null
}
