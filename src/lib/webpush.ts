// ============================================================
// Lightweight Web Push — wysyłanie notyfikacji bez pakietu web-push
// Używa crypto z Node.js do VAPID JWT + ECDH encryption
// ============================================================

import crypto from 'crypto'

// ─── VAPID ──────────────────────────────────────────────────

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(str: string): Buffer {
  str = str.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) str += '='
  return Buffer.from(str, 'base64')
}

interface VapidHeaders {
  Authorization: string
  'Crypto-Key': string
}

function createVapidHeaders(
  audience: string,
  subject: string,
  publicKey: string,
  privateKey: string,
  expiration?: number
): VapidHeaders {
  const header = { typ: 'JWT', alg: 'ES256' }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    aud: audience,
    exp: expiration || now + 12 * 3600,
    sub: subject,
  }

  const headerB64 = base64UrlEncode(Buffer.from(JSON.stringify(header)))
  const payloadB64 = base64UrlEncode(Buffer.from(JSON.stringify(payload)))
  const unsignedToken = `${headerB64}.${payloadB64}`

  // Sign with ECDSA P-256 using JWK format
  const pubKeyBuf = base64UrlDecode(publicKey)
  // Public key is 65 bytes: 04 + X(32) + Y(32)
  const x = base64UrlEncode(pubKeyBuf.subarray(1, 33))
  const y = base64UrlEncode(pubKeyBuf.subarray(33, 65))

  const key = crypto.createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      d: privateKey,
      x,
      y,
    },
    format: 'jwk',
  })

  const sign = crypto.createSign('SHA256')
  sign.update(unsignedToken)
  const sig = sign.sign({ key, dsaEncoding: 'ieee-p1363' })
  const sigB64 = base64UrlEncode(sig)

  return {
    Authorization: `vapid t=${unsignedToken}.${sigB64}, k=${publicKey}`,
    'Crypto-Key': `p256ecdsa=${publicKey}`,
  }
}

// ─── Encryption (RFC 8291 — aes128gcm) ─────────────────────

function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, length: number): Buffer {
  const prk = crypto.createHmac('sha256', salt).update(ikm).digest()
  const infoBuffer = Buffer.concat([info, Buffer.from([1])])
  const result = crypto.createHmac('sha256', prk).update(infoBuffer).digest()
  return result.subarray(0, length)
}

function encryptPayload(
  payload: string,
  endpoint: string,
  p256dh: string,
  auth: string
): { body: Buffer; headers: Record<string, string> } {
  const clientPublicKey = base64UrlDecode(p256dh)
  const clientAuth = base64UrlDecode(auth)

  // Generate ephemeral ECDH key pair
  const ecdh = crypto.createECDH('prime256v1')
  ecdh.generateKeys()
  const serverPublicKey = ecdh.getPublicKey()
  const sharedSecret = ecdh.computeSecret(clientPublicKey)

  // RFC 8291: IKM derivation with WebPush info
  const authInfo = Buffer.concat([
    Buffer.from('WebPush: info\0'),
    clientPublicKey,
    serverPublicKey,
  ])
  const ikm = hkdf(clientAuth, sharedSecret, authInfo, 32)

  // Content encryption key and nonce (RFC 8291 — no P-256 context)
  const salt = crypto.randomBytes(16)
  const keyInfo = Buffer.from('Content-Encoding: aes128gcm\0')
  const nonceInfo = Buffer.from('Content-Encoding: nonce\0')

  const contentEncryptionKey = hkdf(salt, ikm, keyInfo, 16)
  const nonce = hkdf(salt, ikm, nonceInfo, 12)

  // Pad payload: content + delimiter byte (0x02 = last record)
  const paddedPayload = Buffer.concat([Buffer.from(payload, 'utf8'), Buffer.from([2])])

  const cipher = crypto.createCipheriv('aes-128-gcm', contentEncryptionKey, nonce)
  const encrypted = Buffer.concat([cipher.update(paddedPayload), cipher.final()])
  const tag = cipher.getAuthTag()

  // aes128gcm header: salt(16) + rs(4) + idlen(1) + keyid(65) + encrypted + tag
  const rs = Buffer.alloc(4)
  rs.writeUInt32BE(4096)

  const body = Buffer.concat([
    salt,
    rs,
    Buffer.from([65]),
    serverPublicKey,
    encrypted,
    tag,
  ])

  return {
    body,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'Content-Length': String(body.length),
    },
  }
}

// ─── Send Push ──────────────────────────────────────────────

export interface PushSubscription {
  endpoint: string
  p256dh: string
  auth: string
}

export interface PushPayload {
  title: string
  body: string
  icon?: string
  url?: string
  tag?: string
}

export async function sendPush(
  subscription: PushSubscription,
  payload: PushPayload,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  try {
    const payloadStr = JSON.stringify(payload)
    const url = new URL(subscription.endpoint)
    const audience = `${url.protocol}//${url.host}`

    const vapidHeaders = createVapidHeaders(
      audience,
      vapidSubject,
      vapidPublicKey,
      vapidPrivateKey
    )

    const { body, headers: encHeaders } = encryptPayload(
      payloadStr,
      subscription.endpoint,
      subscription.p256dh,
      subscription.auth
    )

    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        ...encHeaders,
        ...vapidHeaders,
        TTL: '86400',
        Urgency: 'normal',
      },
      body,
    })

    if (response.status === 201 || response.status === 200) {
      return { success: true, statusCode: response.status }
    }

    // 410 = subscription expired — should be cleaned up
    const text = await response.text().catch(() => '')
    return {
      success: false,
      statusCode: response.status,
      error: `Push failed: ${response.status} ${text}`,
    }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

// ─── Batch send to location ─────────────────────────────────

export async function sendPushToLocation(
  subscriptions: PushSubscription[],
  payload: PushPayload,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string
): Promise<{ sent: number; failed: number; expired: string[] }> {
  const expired: string[] = []
  let sent = 0
  let failed = 0

  const results = await Promise.allSettled(
    subscriptions.map(sub =>
      sendPush(sub, payload, vapidPublicKey, vapidPrivateKey, vapidSubject)
    )
  )

  const errors: string[] = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value.success) {
      sent++
    } else {
      failed++
      const detail = r.status === 'fulfilled' ? r.value : { error: (r as any).reason?.message }
      const statusCode = r.status === 'fulfilled' ? r.value.statusCode : undefined
      errors.push(`[${statusCode || '?'}] ${detail.error || 'unknown'}`)
      if (statusCode === 410 || statusCode === 404) {
        expired.push(subscriptions[i].endpoint)
      }
    }
  })

  return { sent, failed, expired, errors }
}
