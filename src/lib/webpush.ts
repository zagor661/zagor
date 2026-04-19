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

  // Sign with ECDSA P-256
  const privKeyBuf = base64UrlDecode(privateKey)
  const key = crypto.createPrivateKey({
    key: Buffer.concat([
      // PKCS8 prefix for P-256
      Buffer.from('30770201010420', 'hex'),
      privKeyBuf,
      Buffer.from('a00a06082a8648ce3d030107a14403420004', 'hex'),
      base64UrlDecode(publicKey),
    ]),
    format: 'der',
    type: 'pkcs8',
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

  // HKDF with auth
  const authInfo = Buffer.from('Content-Encoding: auth\0')
  const prk = hkdf(clientAuth, sharedSecret, authInfo, 32)

  // Key and nonce
  const context = Buffer.concat([
    Buffer.from('P-256\0'),
    Buffer.from([0, 65]),
    clientPublicKey,
    Buffer.from([0, 65]),
    serverPublicKey,
  ])

  const salt = crypto.randomBytes(16)
  const keyInfo = Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), context])
  const nonceInfo = Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), context])

  const contentEncryptionKey = hkdf(salt, prk, keyInfo, 16)
  const nonce = hkdf(salt, prk, nonceInfo, 12)

  // Pad and encrypt
  const padding = Buffer.alloc(2, 0) // 2 bytes of padding
  const paddedPayload = Buffer.concat([Buffer.from(payload, 'utf8'), padding])

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

  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value.success) {
      sent++
    } else {
      failed++
      const statusCode = r.status === 'fulfilled' ? r.value.statusCode : undefined
      if (statusCode === 410 || statusCode === 404) {
        expired.push(subscriptions[i].endpoint)
      }
    }
  })

  return { sent, failed, expired }
}
