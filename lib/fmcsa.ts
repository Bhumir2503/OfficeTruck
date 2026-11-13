import { createAdminClient } from "@/lib/supabase/admin"

/*
 * FMCSA lookups through the QCMobile API, run on the server only.
 *
 * Documented (https://mobile.fmcsa.dot.gov/QCDevsite/docs/qcApi):
 *   GET /carriers/docket-number/:docketNumber/?webKey=…  (MC number lookup)
 *   GET /carriers/:dotNumber/authority?webKey=…
 *   carrier fields: legalName, dbaName, dotNumber, phyStreet, phyCity,
 *   phyState, phyZip, telephone, allowToOperate (Y/N).
 *
 * Not documented, so read defensively: the JSON wrapper around "carrier",
 * the broker authority status, the bond, and any grant date. Each one is
 * looked up under the likely names and left null when absent, and the raw
 * response is always saved so nothing is lost.
 */

const BASE = "https://mobile.fmcsa.dot.gov/qc/services"

export type FmcsaRecord = {
  mc_number: string
  dot_number: string | null
  legal_name: string | null
  dba_name: string | null
  phone: string | null
  street: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  allowed_to_operate: boolean | null
  broker_authority_active: boolean | null
  bond_on_file: boolean | null
  authority_granted_on: string | null
  name_changed_on: string | null
  address_changed_on: string | null
  phone_changed_on: string | null
  authority_changed_on: string | null
  first_checked_at: string
  checked_at: string
}

export const FMCSA_COLUMNS =
  "mc_number, dot_number, legal_name, dba_name, phone, street, city, state, postal_code, allowed_to_operate, broker_authority_active, bond_on_file, authority_granted_on, name_changed_on, address_changed_on, phone_changed_on, authority_changed_on, first_checked_at, checked_at"

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** The first object in `content` (an array or a single object), unwrapped. */
function first(body: unknown, key: string): Json | null {
  const content = isObject(body) ? body.content : null
  const item = Array.isArray(content) ? content[0] : content
  if (!isObject(item)) return null
  return isObject(item[key]) ? (item[key] as Json) : item
}

/** Every object in `content`, unwrapped from `key`. */
function all(body: unknown, key: string): Json[] {
  const content = isObject(body) ? body.content : null
  const items = Array.isArray(content) ? content : content ? [content] : []
  return items
    .filter(isObject)
    .map((item) => (isObject(item[key]) ? (item[key] as Json) : item))
}

function text(source: Json | null, ...names: string[]) {
  for (const name of names) {
    const value = source?.[name]
    if (typeof value === "string" && value.trim() !== "") return value.trim()
    if (typeof value === "number") return String(value)
  }
  return null
}

/** "Y"/"N", "A"/"I", true/false, or a bond amount → true, false or null. */
function flag(source: Json | null, ...names: string[]) {
  for (const name of names) {
    const value = source?.[name]
    if (typeof value === "boolean") return value
    if (typeof value === "number") return value > 0
    if (typeof value === "string") {
      const v = value.trim().toUpperCase()
      if (["Y", "YES", "A", "ACTIVE", "TRUE"].includes(v)) return true
      if (["N", "NO", "I", "INACTIVE", "NONE", "FALSE"].includes(v))
        return false
      if (/^\d+(\.\d+)?$/.test(v)) return Number(v) > 0
    }
  }
  return null
}

/** "MM/DD/YYYY" or "YYYY-MM-DD…" → "YYYY-MM-DD". */
function date(value: string | null) {
  if (!value) return null
  const us = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (us) return `${us[3]}-${us[1]}-${us[2]}`
  const iso = value.match(/^(\d{4}-\d{2}-\d{2})/)
  return iso ? iso[1] : null
}

/** The earliest date under any key mentioning "grant" in the authority list. */
function grantDate(authorities: Json[]) {
  const dates = authorities
    .flatMap((authority) =>
      Object.entries(authority)
        .filter(([key]) => /grant/i.test(key))
        .map(([, value]) => date(typeof value === "string" ? value : null))
    )
    .filter((value): value is string => !!value)
    .sort()
  return dates[0] ?? null
}

async function get(path: string, webKey: string) {
  const response = await fetch(
    `${BASE}${path}${path.includes("?") ? "&" : "?"}webKey=${encodeURIComponent(webKey)}`,
    { cache: "no-store", signal: AbortSignal.timeout(10_000) }
  )
  if (response.status === 404) return null
  if (response.status === 401 || response.status === 403) {
    throw new Error("FMCSA rejected the WebKey. Check FMCSA_WEB_KEY.")
  }
  if (!response.ok) {
    throw new Error(
      `FMCSA didn't answer (${response.status}). Try again later.`
    )
  }
  return (await response.json()) as unknown
}

export type FmcsaResult =
  | { ok: true; record: FmcsaRecord }
  | { ok: false; error: string; notFound?: boolean }

/**
 * Looks a broker up by MC number, saves what FMCSA returned to the shared
 * table, and returns the saved record. Needs FMCSA_WEB_KEY and
 * SUPABASE_SECRET_KEY on the server.
 */
export async function checkFmcsa(mcNumber: string): Promise<FmcsaResult> {
  const webKey = process.env.FMCSA_WEB_KEY
  if (!webKey) {
    return {
      ok: false,
      error: "FMCSA checks aren't set up yet. Add FMCSA_WEB_KEY to the server.",
    }
  }
  const admin = createAdminClient()
  if (!admin) {
    return {
      ok: false,
      error:
        "FMCSA checks aren't set up yet. Add SUPABASE_SECRET_KEY to the server.",
    }
  }
  if (!/^[0-9]{1,8}$/.test(mcNumber)) {
    return { ok: false, error: "Enter an MC number of up to 8 digits." }
  }

  let carrierBody: unknown
  let authorityBody: unknown = null
  try {
    carrierBody = await get(`/carriers/docket-number/${mcNumber}/`, webKey)
    const carrier = first(carrierBody, "carrier")
    if (!carrier) {
      return {
        ok: false,
        notFound: true,
        error: `FMCSA has no company with MC ${mcNumber}.`,
      }
    }
    const dot = text(carrier, "dotNumber")
    if (dot) {
      // Authority details are a second call; a failure here isn't fatal.
      authorityBody = await get(`/carriers/${dot}/authority`, webKey).catch(
        () => null
      )
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Couldn't reach FMCSA.",
    }
  }

  const carrier = first(carrierBody, "carrier")
  const authorities = all(authorityBody, "carrierAuthority")
  const brokerAuthority =
    authorities.find((a) => flag(a, "authorizedForBroker") !== null) ??
    authorities[0] ??
    null

  const row = {
    mc_number: mcNumber,
    dot_number: text(carrier, "dotNumber"),
    legal_name: text(carrier, "legalName"),
    dba_name: text(carrier, "dbaName"),
    phone: text(carrier, "telephone", "phone"),
    street: text(carrier, "phyStreet"),
    city: text(carrier, "phyCity"),
    state: text(carrier, "phyState"),
    postal_code: text(carrier, "phyZip", "phyZipcode"),
    allowed_to_operate: flag(carrier, "allowToOperate", "allowedToOperate"),
    broker_authority_active:
      flag(carrier, "brokerAuthorityStatus") ??
      flag(brokerAuthority, "brokerAuthorityStatus", "authorizedForBroker"),
    bond_on_file: flag(
      carrier,
      "bondInsuranceOnFile",
      "bondOnFile",
      "brokerBondOnFile"
    ),
    authority_granted_on: grantDate(authorities),
    checked_at: new Date().toISOString(),
    raw: { carrier: carrierBody, authority: authorityBody },
  }

  const { data, error } = await admin
    .from("fmcsa_records")
    .upsert(row, { onConflict: "mc_number" })
    .select(FMCSA_COLUMNS)
    .single()

  if (error) {
    return { ok: false, error: error.message }
  }
  return { ok: true, record: data as FmcsaRecord }
}
