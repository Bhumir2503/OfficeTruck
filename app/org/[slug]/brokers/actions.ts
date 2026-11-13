"use server"

import { refresh } from "next/cache"

import { isStale } from "@/lib/broker-format"
import { findBrokerByMc } from "@/lib/brokers"
import { checkFmcsa, FMCSA_COLUMNS, type FmcsaRecord } from "@/lib/fmcsa"
import { getMyOrganizations } from "@/lib/organizations"
import {
  brokerSchema,
  cleanMcNumber,
  contactSchema,
  doNotUseSchema,
  type BrokerValues,
  type ContactValues,
} from "@/lib/schemas/broker"
import { createClient } from "@/lib/supabase/server"

export type ActionResult = { error: string } | { ok: true }
export type CreateBrokerResult =
  | { error: string }
  | { ok: true; id: string; fmcsaError?: string; contactsError?: string }

async function isMember(organizationId: string) {
  return (await getMyOrganizations()).some((org) => org.id === organizationId)
}

const NOT_MEMBER = "You aren't a member of this organization."

function message(error: { code?: string; message: string }) {
  if (error.code === "23505") {
    return "You already have a broker with this MC number."
  }
  return error.message
}

/** Runs the FMCSA check unless a recent one is on file. Errors are returned, not thrown. */
async function refreshFmcsa(mcNumber: string | null, force = false) {
  if (!mcNumber) return undefined
  if (!force) {
    const supabase = await createClient()
    const { data } = await supabase
      .from("fmcsa_records")
      .select(FMCSA_COLUMNS)
      .eq("mc_number", mcNumber)
      .maybeSingle()
    if (!isStale(data as FmcsaRecord | null)) return undefined
  }
  const result = await checkFmcsa(mcNumber)
  return result.ok ? undefined : result.error
}

export type McLookup =
  | { error: string }
  | {
      ok: true
      /** A broker you already have with this MC number. */
      existing: { id: string; legal_name: string } | null
      /** What FMCSA has on file, to fill in the form. */
      fmcsa: FmcsaRecord | null
      fmcsaError?: string
    }

/**
 * Looks an MC number up before adding a broker: whether you already have
 * them, and what FMCSA says, so the form can fill itself in.
 */
export async function lookupMc(
  organizationId: string,
  input: string
): Promise<McLookup> {
  if (!(await isMember(organizationId))) {
    return { error: NOT_MEMBER }
  }
  const mc = cleanMcNumber(input)
  if (!/^[0-9]{1,8}$/.test(mc)) {
    return { error: "Enter an MC number of up to 8 digits." }
  }

  const existing = await findBrokerByMc(organizationId, mc)
  if (existing) {
    return { ok: true, existing, fmcsa: null }
  }

  const result = await checkFmcsa(mc)
  if (result.ok) {
    return { ok: true, existing: null, fmcsa: result.record }
  }
  // Fall back to whatever was saved before, if FMCSA can't be reached now.
  const supabase = await createClient()
  const { data } = await supabase
    .from("fmcsa_records")
    .select(FMCSA_COLUMNS)
    .eq("mc_number", mc)
    .maybeSingle()
  return {
    ok: true,
    existing: null,
    fmcsa: (data as FmcsaRecord | null) ?? null,
    fmcsaError: result.error,
  }
}

/** Adds a broker, then checks them with FMCSA if there's an MC number. */
export async function createBroker(
  organizationId: string,
  input: BrokerValues,
  contactsInput: ContactValues[] = []
): Promise<CreateBrokerResult> {
  if (!(await isMember(organizationId))) {
    return { error: NOT_MEMBER }
  }
  const parsed = brokerSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." }
  }
  const contactsParsed = contactSchema.array().max(20).safeParse(contactsInput)
  if (!contactsParsed.success) {
    return {
      error: contactsParsed.error.issues[0]?.message ?? "Check the contacts.",
    }
  }
  const contacts = contactsParsed.data

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("brokers")
    .insert({ ...parsed.data, organization_id: organizationId })
    .select("id")
    .single()

  if (error) {
    return { error: message(error) }
  }

  // Contacts listed on the Add Broker form, saved now the broker exists.
  let contactsError: string | undefined
  if (contacts.length) {
    const { error: insertError } = await supabase
      .from("broker_contacts")
      .insert(
        contacts.map((contact) => ({
          ...contact,
          organization_id: organizationId,
          broker_id: data.id,
        }))
      )
    if (insertError) {
      contactsError = insertError.message
    }
  }

  const fmcsaError = await refreshFmcsa(parsed.data.mc_number)
  refresh()
  return { ok: true, id: data.id, fmcsaError, contactsError }
}

export async function updateBroker(
  organizationId: string,
  brokerId: string,
  input: BrokerValues
): Promise<ActionResult> {
  if (!(await isMember(organizationId))) {
    return { error: NOT_MEMBER }
  }
  const parsed = brokerSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." }
  }
  const result = await update(organizationId, brokerId, parsed.data)
  if ("ok" in result) {
    // A new MC number gets its own check.
    await refreshFmcsa(parsed.data.mc_number)
  }
  return result
}

export async function setDoNotUse(
  organizationId: string,
  brokerId: string,
  input: { do_not_use: boolean; do_not_use_reason: string | null }
): Promise<ActionResult> {
  if (!(await isMember(organizationId))) {
    return { error: NOT_MEMBER }
  }
  const parsed = doNotUseSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the reason." }
  }
  return update(organizationId, brokerId, {
    do_not_use: parsed.data.do_not_use,
    do_not_use_reason: parsed.data.do_not_use
      ? parsed.data.do_not_use_reason
      : null,
  })
}

/** Checks the broker with FMCSA now, whenever it last ran. */
export async function runFmcsaCheck(
  organizationId: string,
  brokerId: string
): Promise<ActionResult> {
  if (!(await isMember(organizationId))) {
    return { error: NOT_MEMBER }
  }
  const supabase = await createClient()
  const { data } = await supabase
    .from("brokers")
    .select("mc_number")
    .eq("organization_id", organizationId)
    .eq("id", brokerId)
    .maybeSingle()
  if (!data) {
    return { error: "That broker doesn't exist anymore." }
  }
  if (!data.mc_number) {
    return { error: "Add the broker's MC number to check them with FMCSA." }
  }
  const error = await refreshFmcsa(data.mc_number, true)
  refresh()
  return error ? { error } : { ok: true }
}

async function update(
  organizationId: string,
  brokerId: string,
  values: Partial<BrokerValues> & {
    do_not_use?: boolean
    do_not_use_reason?: string | null
  }
): Promise<ActionResult> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("brokers")
    .update(values)
    .eq("organization_id", organizationId)
    .eq("id", brokerId)
    .select("id")

  if (error) {
    return { error: message(error) }
  }
  // Row-level security skips the update, rather than failing.
  if (!data.length) {
    return { error: "That broker doesn't exist anymore." }
  }
  refresh()
  return { ok: true }
}

// ------------------------------------------------------------ Contacts --

export async function addContact(
  organizationId: string,
  brokerId: string,
  input: ContactValues
): Promise<ActionResult> {
  if (!(await isMember(organizationId))) {
    return { error: NOT_MEMBER }
  }
  const parsed = contactSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the contact." }
  }
  const supabase = await createClient()
  const { error } = await supabase.from("broker_contacts").insert({
    ...parsed.data,
    organization_id: organizationId,
    broker_id: brokerId,
  })
  if (error) {
    return {
      error:
        error.code === "23503"
          ? "That broker doesn't exist anymore."
          : error.message,
    }
  }
  refresh()
  return { ok: true }
}

export async function removeContact(
  organizationId: string,
  contactId: string
): Promise<ActionResult> {
  if (!(await isMember(organizationId))) {
    return { error: NOT_MEMBER }
  }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("broker_contacts")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", contactId)
    .select("id")
  if (error) {
    return { error: error.message }
  }
  if (!data.length) {
    return { error: "That contact was already removed." }
  }
  refresh()
  return { ok: true }
}
