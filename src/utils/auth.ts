// Session/JWT + password helpers cho Cloudflare Workers
// Thay thế Django: authenticate(), login(), logout(), @login_required
// Dùng WebCrypto API (built-in trong Workers)

import type { Context } from 'hono'
import type { Env } from '../index'

export type SessionUser = {
  userId: number
  username: string
}

const COOKIE_NAME = 'session'
const SESSION_TTL = 60 * 60 * 24 * 7 // 7 ngày (giây)

// ── Password hashing dùng PBKDF2 (WebCrypto) ──
export async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    256
  )
  const saltHex = Array.from(salt).map((b) => b.toString(16).padStart(2, '0')).join('')
  const hashHex = Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, '0')).join('')
  return `pbkdf2$${saltHex}$${hashHex}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [, saltHex, hashHex] = stored.split('$')
  if (!saltHex || !hashHex) return false
  const enc = new TextEncoder()
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map((h) => parseInt(h, 16)))
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    256
  )
  const testHex = Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, '0')).join('')
  return testHex === hashHex
}

// ── JWT helpers dùng HMAC-SHA256 ──
function base64url(data: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(data)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlDecode(str: string): Uint8Array {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

export async function createJwt(payload: object, secret: string): Promise<string> {
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const body = base64url(new TextEncoder().encode(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000) })))
  const key = await getHmacKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${body}`))
  return `${header}.${body}.${base64url(sig)}`
}

export async function verifyJwt(token: string, secret: string): Promise<Record<string, unknown> | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, body, sig] = parts
  const key = await getHmacKey(secret)
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    base64urlDecode(sig),
    new TextEncoder().encode(`${header}.${body}`)
  )
  if (!valid) return null
  try {
    return JSON.parse(new TextDecoder().decode(base64urlDecode(body))) as Record<string, unknown>
  } catch {
    return null
  }
}

// ── Session: đọc/ghi cookie JWT ──
export async function getSession(c: Context<{ Bindings: Env }>): Promise<SessionUser | null> {
  const cookie = getCookie(c.req.raw, COOKIE_NAME)
  if (!cookie) return null
  const payload = await verifyJwt(cookie, c.env.SECRET_KEY)
  if (!payload) return null
  const exp = payload['exp'] as number | undefined
  if (exp && exp < Math.floor(Date.now() / 1000)) return null
  return {
    userId: payload['userId'] as number,
    username: payload['username'] as string,
  }
}

export async function setSession(
  c: Context<{ Bindings: Env }>,
  user: SessionUser,
  headers: Headers
): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL
  const token = await createJwt({ ...user, exp }, c.env.SECRET_KEY)
  headers.append(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL}`
  )
}

export function clearSession(headers: Headers): void {
  headers.append('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0`)
}

// ── Cookie helper ──
function getCookie(req: Request, name: string): string | null {
  const header = req.headers.get('Cookie') ?? ''
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k.trim() === name) return v.join('=')
  }
  return null
}

// ── requireLogin: tương đương @login_required ──
export async function requireLogin(
  c: Context<{ Bindings: Env }>,
  next: () => Promise<Response>
): Promise<Response> {
  const session = await getSession(c)
  if (!session) {
    const path = new URL(c.req.url).pathname
    return c.redirect(`/login?next=${encodeURIComponent(path)}`)
  }
  c.set('user' as never, session)
  return next()
}

// ── quizUserHasAccess: tương đương _quiz_user_has_access ──
export function quizUserHasAccess(
  quiz: { has_key_username: number | boolean; key_usernames: string },
  username: string
): boolean {
  if (!quiz.has_key_username) return true
  let keyUsernames: string[] = []
  try { keyUsernames = JSON.parse(quiz.key_usernames) } catch { /* ignore */ }
  return keyUsernames.map((u) => u.trim().toLowerCase()).includes(username.toLowerCase())
}
