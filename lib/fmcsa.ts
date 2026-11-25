import { createAdminClient } from "@/lib/supabase/admin"

/*
 * FMCSA broker lookups, run on the server only. Two sources:
 *
 * 1. The DOT open data "Carrier - All With History" dataset (6eyk-hxee) on
 *    data.transportation.gov, through its SODA3 query API. Used whenever
 *    DOT_DATA_APP_TOKEN is set; the v3 API turns away requests without one.
 *    One row per docket: MC numbers are "MC" plus at least six digits
 *    ("MC000693"), DOT numbers eight ("00107080"). broker_stat is A(ctive),
 *    I(nactive) or N(one); bond_file is Y/N. It has no authority grant date
 *    and no "allowed to operate", so those stay null.
 *
 * 2. The QCMobile API, when only FMCSA_WEB_KEY is set (it's been down).
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
const DOT_DATA_URL =
  "https://data.transportation.gov/api/v3/views/6eyk-hxee/query.json"

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
  | {
      ok: false
      error: string
      notFound?: boolean
      /** FMCSA's data couldn't be reached: down, slow or erroring. */
      unavailable?: boolean
    }

const DOWN = "FMCSA's servers are down right now."

type Lookup =
  | { ok: true; row: Omit<FmcsaRow, "mc_number" | "checked_at"> }
  | { ok: false; error: string; notFound?: boolean; unavailable?: boolean }

type FmcsaRow = Omit<
  FmcsaRecord,
  | "first_checked_at"
  | "name_changed_on"
  | "address_changed_on"
  | "phone_changed_on"
  | "authority_changed_on"
> & { raw: unknown }

/** One docket from the DOT open data carrier dataset. */
async function lookUpDotData(mcNumber: string, token: string): Promise<Lookup> {
  // Stored as "MC" plus at least six digits.
  const docket = `MC${mcNumber.padStart(6, "0")}`
  let body: unknown
  try {
    const response = await fetch(process.env.DOT_DATA_URL || DOT_DATA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-App-Token": token },
      body: JSON.stringify({
        // The docket is built from digits only, so it's safe to inline.
        query: `SELECT * WHERE docket_number = '${docket}'`,
        page: { pageNumber: 1, pageSize: 5 },
        // Leave out Socrata's own :id and :created_at columns.
        includeSynthetic: false,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    })
    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        error:
          "The DOT data API turned the request away. Check DOT_DATA_APP_TOKEN.",
      }
    }
    if (!response.ok) {
      return { ok: false, unavailable: true, error: DOWN }
    }
    body = await response.json()
  } catch {
    // No connection, a timeout, or a reply that isn't JSON.
    return { ok: false, unavailable: true, error: DOWN }
  }

  const rows = (
    Array.isArray(body)
      ? body
      : isObject(body) && Array.isArray(body.data)
        ? body.data
        : []
  ).filter(isObject)
  // Prefer the row with active broker authority, if a docket has several.
  const carrier = rows.find((r) => text(r, "broker_stat") === "A") ?? rows[0]
  if (!carrier) {
    return {
      ok: false,
      notFound: true,
      error: `FMCSA has no company with MC ${mcNumber}.`,
    }
  }
  const dot = text(carrier, "dot_number")?.replace(/^0+(?=\d)/, "") ?? null
  return {
    ok: true,
    row: {
      dot_number: dot,
      legal_name: text(carrier, "legal_name"),
      dba_name: text(carrier, "dba_name"),
      phone: text(carrier, "bus_telno"),
      street: text(carrier, "bus_street_po"),
      city: text(carrier, "bus_city"),
      state: text(carrier, "bus_state_code"),
      postal_code: text(carrier, "bus_zip_code"),
      allowed_to_operate: null,
      broker_authority_active: flag(carrier, "broker_stat"),
      bond_on_file: flag(carrier, "bond_file"),
      authority_granted_on: null,
      raw: { dot_data: carrier },
    },
  }
}

/** A carrier and its authority from QCMobile. */
async function lookUpQcMobile(
  mcNumber: string,
  webKey: string
): Promise<Lookup> {
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
    // A rejected WebKey is ours to fix; anything else is FMCSA being down.
    return error instanceof Error && error.message.includes("WebKey")
      ? { ok: false, error: error.message }
      : { ok: false, unavailable: true, error: DOWN }
  }

  const carrier = first(carrierBody, "carrier")
  const authorities = all(authorityBody, "carrierAuthority")
  const brokerAuthority =
    authorities.find((a) => flag(a, "authorizedForBroker") !== null) ??
    authorities[0] ??
    null

  return {
    ok: true,
    row: {
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
      raw: { carrier: carrierBody, authority: authorityBody },
    },
  }
}

/**
 * Looks a broker up by MC number, saves what FMCSA returned to the shared
 * table, and returns the saved record. Needs DOT_DATA_APP_TOKEN (or
 * FMCSA_WEB_KEY for QCMobile) and SUPABASE_SECRET_KEY on the server.
 */
export async function checkFmcsa(mcNumber: string): Promise<FmcsaResult> {
  const token = process.env.DOT_DATA_APP_TOKEN
  const webKey = process.env.FMCSA_WEB_KEY
  if (!token && !webKey) {
    return {
      ok: false,
      error:
        "FMCSA checks aren't set up yet. Add DOT_DATA_APP_TOKEN to the server.",
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

  const found = token
    ? await lookUpDotData(mcNumber, token)
    : await lookUpQcMobile(mcNumber, webKey!)
  if (!found.ok) {
    return found
  }

  const { data, error } = await admin
    .from("fmcsa_records")
    .upsert(
      {
        ...found.row,
        mc_number: mcNumber,
        checked_at: new Date().toISOString(),
      },
      { onConflict: "mc_number" }
    )
    .select(FMCSA_COLUMNS)
    .single()

  if (error) {
    return { ok: false, error: error.message }
  }
  return { ok: true, record: data as FmcsaRecord }
}
