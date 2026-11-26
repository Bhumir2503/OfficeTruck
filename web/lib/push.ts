import "server-only"

// Push notifications to the driver app through Apple's push service (APNs).
// Server only: it needs the APNs auth key, which must never be NEXT_PUBLIC_.
//
//   APNS_KEY_ID        the key's id (10 characters), from developer.apple.com
//   APNS_TEAM_ID       the Apple developer team id
//   APNS_PRIVATE_KEY   the .p8 file's contents (newlines may be written \n)
//   APNS_BUNDLE_ID     optional, defaults to the driver app's bundle id
//
// Without them nothing is sent: dispatching still works, the driver just
// isn't notified. Nothing about the load's rate goes in a push.

import { connect } from "node:http2"
import { createPrivateKey, sign } from "node:crypto"

import { after } from "next/server"

import type { SupabaseClient } from "@supabase/supabase-js"

type PushTarget = {
  token: string
  environment: "sandbox" | "production"
  reference: string
  pickup_location: string
  pickup_start: string
  delivery_location: string
}

const HOSTS = {
  sandbox: "https://api.sandbox.push.apple.com",
  production: "https://api.push.apple.com",
} as const

/**
 * Tells the load's driver, on every phone they're signed in on, that it was
 * dispatched to them. Looks the phones up now (as the signed-in office user)
 * and sends after the response, so the office never waits on Apple.
 */
export async function notifyLoadDispatched(
  supabase: SupabaseClient,
  loadId: string
) {
  const config = apnsConfig()
  if (!config) return

  const { data, error } = await supabase.rpc("load_push_targets", {
    target_load: loadId,
  })
  if (error || !data?.length) return
  const targets = data as PushTarget[]

  after(async () => {
    const results = await Promise.allSettled(
      targets.map((target) =>
        sendPush(config, target.token, target.environment, {
          aps: {
            alert: {
              title: `New load ${target.reference}`,
              body: `${target.pickup_location} → ${target.delivery_location}, picks up ${wallClock(target.pickup_start)}`,
            },
            sound: "default",
          },
          load_id: loadId,
        })
      )
    )
    for (const result of results) {
      if (result.status === "rejected") {
        console.error("Push to driver failed:", result.reason)
      }
    }
  })
}

type ApnsConfig = {
  keyId: string
  teamId: string
  privateKey: string
  bundleId: string
}

function apnsConfig(): ApnsConfig | null {
  const keyId = process.env.APNS_KEY_ID
  const teamId = process.env.APNS_TEAM_ID
  const privateKey = process.env.APNS_PRIVATE_KEY?.replace(/\\n/g, "\n")
  if (!keyId || !teamId || !privateKey) return null
  return {
    keyId,
    teamId,
    privateKey,
    bundleId: process.env.APNS_BUNDLE_ID || "com.officetruck.driver",
  }
}

/** Apple takes one signed token for up to an hour; one is reused for 50 minutes. */
let cachedToken: { value: string; madeAt: number } | null = null

function providerToken(config: ApnsConfig) {
  const now = Math.floor(Date.now() / 1000)
  if (cachedToken && now - cachedToken.madeAt < 50 * 60) {
    return cachedToken.value
  }
  const header = base64url(JSON.stringify({ alg: "ES256", kid: config.keyId }))
  const claims = base64url(JSON.stringify({ iss: config.teamId, iat: now }))
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), {
    key: createPrivateKey(config.privateKey),
    dsaEncoding: "ieee-p1363",
  })
  const value = `${header}.${claims}.${base64url(signature)}`
  cachedToken = { value, madeAt: now }
  return value
}

function base64url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url")
}

/** One push over HTTP/2, which Apple requires. Rejects with Apple's reason. */
function sendPush(
  config: ApnsConfig,
  deviceToken: string,
  environment: PushTarget["environment"],
  payload: object
) {
  return new Promise<void>((resolve, reject) => {
    const client = connect(HOSTS[environment])
    client.on("error", reject)
    const request = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${providerToken(config)}`,
      "apns-topic": config.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
    })
    let status = 0
    let body = ""
    request.on("response", (headers) => {
      status = Number(headers[":status"])
    })
    request.setEncoding("utf8")
    request.on("data", (chunk) => (body += chunk))
    request.on("end", () => {
      client.close()
      if (status === 200) resolve()
      else reject(new Error(`APNs ${status} ${body}`))
    })
    request.on("error", (error) => {
      client.close()
      reject(error)
    })
    request.end(JSON.stringify(payload))
  })
}

/** "2026-11-25T15:00:00" → "Wed, Nov 25, 3:00 PM", as written at the stop. */
function wallClock(value: string) {
  const date = new Date(`${value.slice(0, 19)}Z`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}
