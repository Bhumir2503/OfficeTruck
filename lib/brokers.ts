import { FMCSA_COLUMNS, type FmcsaRecord } from "@/lib/fmcsa"
import type { ContactRole, InvoiceMethod } from "@/lib/schemas/broker"
import type { LoadStatus } from "@/lib/schemas/load"
import { createClient } from "@/lib/supabase/server"

export type Broker = {
  id: string
  legal_name: string
  dba_name: string | null
  mc_number: string | null
  dot_number: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  email_domains: string[]
  invoice_method: InvoiceMethod
  billing_emails: string[]
  portal_url: string | null
  payment_terms_days: number
  quick_pay_fee_percent: number | null
  factored: boolean
  noa_on_file: boolean
  do_not_use: boolean
  do_not_use_reason: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

/** A broker with its shared FMCSA record, if it's been checked. */
export type BrokerWithFmcsa = Broker & { fmcsa: FmcsaRecord | null }

const BROKER_COLUMNS =
  "id, legal_name, dba_name, mc_number, dot_number, address_line1, address_line2, city, state, postal_code, email_domains, invoice_method, billing_emails, portal_url, payment_terms_days, quick_pay_fee_percent, factored, noa_on_file, do_not_use, do_not_use_reason, notes, created_at, updated_at"

/**
 * FMCSA records for these MC numbers, by MC number. The shared table has no
 * foreign key to brokers (it isn't per organization), so it's joined here.
 */
async function fmcsaFor(mcNumbers: (string | null)[]) {
  const wanted = [...new Set(mcNumbers.filter((mc): mc is string => !!mc))]
  const byMc = new Map<string, FmcsaRecord>()
  if (wanted.length) {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("fmcsa_records")
      .select(FMCSA_COLUMNS)
      .in("mc_number", wanted)
    if (error) {
      throw error
    }
    for (const record of data as FmcsaRecord[]) {
      byMc.set(record.mc_number, record)
    }
  }
  return byMc
}

/** Every broker in the organization, by name, with its FMCSA record. */
export async function getBrokers(
  organizationId: string
): Promise<BrokerWithFmcsa[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("brokers")
    .select(BROKER_COLUMNS)
    .eq("organization_id", organizationId)
    .order("legal_name")

  if (error) {
    throw error
  }
  const brokers = data as Broker[]
  const fmcsa = await fmcsaFor(brokers.map((broker) => broker.mc_number))
  return brokers.map((broker) => ({
    ...broker,
    fmcsa: broker.mc_number ? (fmcsa.get(broker.mc_number) ?? null) : null,
  }))
}

/** One broker with its FMCSA record, or null if it isn't in this organization. */
export async function getBroker(
  organizationId: string,
  id: string
): Promise<BrokerWithFmcsa | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("brokers")
    .select(BROKER_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle()

  if (error) {
    // An id that isn't a UUID is just a broker that doesn't exist.
    if (error.code === "22P02") {
      return null
    }
    throw error
  }
  if (!data) {
    return null
  }
  const broker = data as Broker
  const fmcsa = await fmcsaFor([broker.mc_number])
  return {
    ...broker,
    fmcsa: broker.mc_number ? (fmcsa.get(broker.mc_number) ?? null) : null,
  }
}

/** The broker in this organization with this MC number, if there is one. */
export async function findBrokerByMc(
  organizationId: string,
  mcNumber: string
): Promise<{ id: string; legal_name: string } | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("brokers")
    .select("id, legal_name")
    .eq("organization_id", organizationId)
    .eq("mc_number", mcNumber)
    .maybeSingle()
  if (error) {
    throw error
  }
  return data
}

export type BrokerContact = {
  id: string
  name: string
  role: ContactRole
  email: string | null
  phone: string | null
}

export async function getBrokerContacts(
  organizationId: string,
  brokerId: string
): Promise<BrokerContact[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("broker_contacts")
    .select("id, name, role, email, phone")
    .eq("organization_id", organizationId)
    .eq("broker_id", brokerId)
    .order("created_at")

  if (error) {
    throw error
  }
  return data as BrokerContact[]
}

/** A broker as offered in the load form's broker picker, with what to warn about. */
export type BrokerOption = Pick<
  Broker,
  | "id"
  | "legal_name"
  | "dba_name"
  | "mc_number"
  | "email_domains"
  | "payment_terms_days"
  | "quick_pay_fee_percent"
  | "invoice_method"
  | "factored"
  | "noa_on_file"
  | "do_not_use"
  | "do_not_use_reason"
> & { fmcsa: FmcsaRecord | null }

export async function getBrokerOptions(
  organizationId: string
): Promise<BrokerOption[]> {
  const brokers = await getBrokers(organizationId)
  return brokers.map((broker) => ({
    id: broker.id,
    legal_name: broker.legal_name,
    dba_name: broker.dba_name,
    mc_number: broker.mc_number,
    email_domains: broker.email_domains,
    payment_terms_days: broker.payment_terms_days,
    quick_pay_fee_percent: broker.quick_pay_fee_percent,
    invoice_method: broker.invoice_method,
    factored: broker.factored,
    noa_on_file: broker.noa_on_file,
    do_not_use: broker.do_not_use,
    do_not_use_reason: broker.do_not_use_reason,
    fmcsa: broker.fmcsa,
  }))
}

export type BrokerLoad = {
  id: string
  reference: string
  pickup_location: string
  delivery_location: string
  pickup_start: string
  rate: number
  status: LoadStatus
  rate_con_from: string | null
}

/** The loads booked with a broker, newest pickup first. */
export async function getBrokerLoads(
  organizationId: string,
  brokerId: string
): Promise<BrokerLoad[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("loads")
    .select(
      "id, reference, pickup_location, delivery_location, pickup_start, rate, status, rate_con_from"
    )
    .eq("organization_id", organizationId)
    .eq("broker_id", brokerId)
    .order("pickup_start", { ascending: false })

  if (error) {
    throw error
  }
  return data as BrokerLoad[]
}
