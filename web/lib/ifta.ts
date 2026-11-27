import { quarterRange, type Quarter } from "@/lib/ifta-format"
import { mergeFuel } from "@/lib/ifta-import"
import { createClient } from "@/lib/supabase/server"

export type IftaMilesRow = {
  id: string
  truck_id: string
  jurisdiction: string
  miles: number
  source: "manual" | "eld"
}

export type IftaFuelRow = {
  id: string
  truck_id: string
  purchased_on: string
  jurisdiction: string
  gallons: number
  amount: number | null
  vendor: string | null
  /**
   * Set when the purchase is a fuel expense on a load (with gallons and a
   * state): it's changed on the load, not here.
   */
  load: { id: string; reference: string } | null
}

type LoadFuelRow = {
  id: string
  spent_on: string
  gallons: number
  jurisdiction: string
  amount: number
  note: string | null
  load: { id: string; reference: string; truck_id: string | null } | null
}

/**
 * Fuel expenses on loads that have gallons and a state, between two days,
 * as purchases. Loads without a truck are left out: IFTA counts by truck.
 */
export async function getLoadFuel(
  organizationId: string,
  start: string,
  end: string
): Promise<IftaFuelRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("load_expenses")
    .select(
      "id, spent_on, gallons, jurisdiction, amount, note, load:loads (id, reference, truck_id)"
    )
    .eq("organization_id", organizationId)
    .eq("kind", "fuel")
    .not("gallons", "is", null)
    .gte("spent_on", start)
    .lte("spent_on", end)
  if (error) throw error
  return (data as unknown as LoadFuelRow[])
    .filter((row) => row.load?.truck_id)
    .map((row) => ({
      id: row.id,
      truck_id: row.load!.truck_id!,
      purchased_on: row.spent_on,
      jurisdiction: row.jurisdiction,
      gallons: Number(row.gallons),
      amount: Number(row.amount),
      vendor: row.note,
      load: { id: row.load!.id, reference: row.load!.reference },
    }))
}

/** A quarter's miles by state, fuel purchases, and when it was filed. */
export async function getIftaQuarter(organizationId: string, quarter: Quarter) {
  const supabase = await createClient()
  const { start, end } = quarterRange(quarter)
  const [miles, fuel, filing, loadFuel] = await Promise.all([
    supabase
      .from("ifta_state_miles")
      .select("id, truck_id, jurisdiction, miles, source")
      .eq("organization_id", organizationId)
      .eq("year", quarter.year)
      .eq("quarter", quarter.quarter)
      .order("jurisdiction"),
    supabase
      .from("ifta_fuel_purchases")
      .select(
        "id, truck_id, purchased_on, jurisdiction, gallons, amount, vendor"
      )
      .eq("organization_id", organizationId)
      .gte("purchased_on", start)
      .lte("purchased_on", end)
      .order("purchased_on", { ascending: false }),
    supabase
      .from("ifta_filings")
      .select("filed_on")
      .eq("organization_id", organizationId)
      .eq("year", quarter.year)
      .eq("quarter", quarter.quarter)
      .maybeSingle(),
    getLoadFuel(organizationId, start, end),
  ])
  if (miles.error) throw miles.error
  if (fuel.error) throw fuel.error
  if (filing.error) throw filing.error

  return {
    miles: (miles.data as IftaMilesRow[]).map((row) => ({
      ...row,
      miles: Number(row.miles),
    })),
    fuel: mergeFuel(fuel.data as Omit<IftaFuelRow, "load">[], loadFuel),
    filedOn: (filing.data?.filed_on as string | undefined) ?? null,
  }
}

/**
 * Whether the company keeps IFTA here (any miles entered or any quarter
 * marked filed), and whether `quarter` is filed. The dashboard only reminds
 * those who do, so carriers who file IFTA elsewhere aren't nagged.
 */
export async function getIftaReminder(
  organizationId: string,
  quarter: Quarter
) {
  const supabase = await createClient()
  const [miles, filings] = await Promise.all([
    supabase
      .from("ifta_state_miles")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    supabase
      .from("ifta_filings")
      .select("year, quarter")
      .eq("organization_id", organizationId),
  ])
  if (miles.error) throw miles.error
  if (filings.error) throw filings.error
  const rows = filings.data as { year: number; quarter: number }[]
  return {
    inUse: (miles.count ?? 0) > 0 || rows.length > 0,
    filed: rows.some(
      (row) => row.year === quarter.year && row.quarter === quarter.quarter
    ),
  }
}
