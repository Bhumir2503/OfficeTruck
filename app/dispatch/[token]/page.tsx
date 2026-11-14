import type { Metadata } from "next"
import { Ban, MapPin, PackageCheck } from "lucide-react"

import { StopCheckIn } from "@/components/dispatch/stop-check-in"
import { Logo } from "@/components/logo"
import { SettingsCard } from "@/components/settings/settings-card"
import { formatRate, formatStopWindow } from "@/lib/load-format"
import {
  CHARGE_KIND_LABELS,
  EQUIPMENT_LABELS,
  type ChargeKind,
  type EquipmentType,
} from "@/lib/schemas/load"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Your load | OfficeTruck",
  // A private link: keep it out of search engines.
  robots: { index: false, follow: false },
}

type Packet = {
  reference: string
  broker_name: string | null
  reference_numbers: string | null
  equipment: EquipmentType | null
  commodity: string | null
  weight_lbs: number | null
  trailer_number: string | null
  notes: string | null
  miles: number | null
  truck: string | null
  driver: string | null
  stops: {
    position: number
    kind: "pickup" | "delivery"
    location: string
    appointment_start: string
    appointment_end: string | null
    stop_number: string | null
    notes: string | null
  }[]
  rate: {
    total: number
    detention_free_hours: number | null
    detention_rate: number | null
    charges: { kind: ChargeKind; description: string | null; amount: number }[]
  } | null
}

/** The load's stops as they are now, for checking in. */
type LiveStops = {
  status: string
  stops: {
    position: number
    kind: "pickup" | "delivery"
    location: string
    arrived_at: string | null
    departed_at: string | null
  }[]
}

type Dispatch = {
  organization: string
  packet: Packet | null
  sent_at: string
  seen_at: string | null
  revoked: boolean
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-muted/40 px-4 py-6">
      <div className="mx-auto flex max-w-lg flex-col gap-4">
        <Logo />
        {children}
      </div>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  )
}

/**
 * What a driver opens from their dispatch email: the stops, appointments,
 * pickup numbers and rate con for one load. No sign-in; the link is the key.
 */
export default async function DispatchPage({
  params,
}: PageProps<"/dispatch/[token]">) {
  const { token } = await params
  const supabase = await createClient()
  const { data } = await supabase.rpc("open_dispatch", { link_token: token })
  const dispatch = data as Dispatch | null

  if (!dispatch) {
    return (
      <Frame>
        <SettingsCard
          title="This link doesn't work"
          description="Check you copied the whole link, or ask dispatch to send it again."
        />
      </Frame>
    )
  }

  if (dispatch.revoked || !dispatch.packet) {
    return (
      <Frame>
        <SettingsCard
          title="This load is off your schedule"
          description={`${dispatch.organization} took you off this load, or sent you a newer link. Don't go to its pickups. If you're already on the way, call dispatch.`}
        >
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Ban className="size-4" />
            This link no longer shows the load.
          </div>
        </SettingsCard>
      </Frame>
    )
  }

  const load = dispatch.packet
  const { data: liveData } = await supabase.rpc("dispatch_stops", {
    link_token: token,
  })
  const live = liveData as LiveStops | null
  const onTheRoad =
    !!live && ["dispatched", "loaded", "delivered"].includes(live.status)
  // A stop can be checked in only if it's still the same stop as was sent.
  const liveStop = (stop: Packet["stops"][number]) =>
    live?.stops.find(
      (other) =>
        other.position === stop.position &&
        other.kind === stop.kind &&
        other.location === stop.location
    )
  const facts = [
    load.equipment && ["Equipment", EQUIPMENT_LABELS[load.equipment]],
    load.trailer_number && ["Trailer", load.trailer_number],
    load.truck && ["Truck", load.truck],
    load.commodity && ["Commodity", load.commodity],
    load.weight_lbs != null && [
      "Weight",
      `${Number(load.weight_lbs).toLocaleString("en-US")} lbs`,
    ],
    load.miles != null && ["Miles", Number(load.miles).toLocaleString("en-US")],
  ].filter(Boolean) as [string, string][]

  return (
    <Frame>
      <SettingsCard
        title={`Load ${load.reference}`}
        description={`From ${dispatch.organization}${load.driver ? ` for ${load.driver}` : ""}.`}
      >
        <dl className="grid grid-cols-2 gap-4">
          {facts.map(([label, value]) => (
            <Detail key={label} label={label} value={value} />
          ))}
          {load.reference_numbers && (
            <div className="col-span-2">
              <Detail
                label="Reference numbers"
                value={load.reference_numbers}
              />
            </div>
          )}
        </dl>
      </SettingsCard>

      <SettingsCard
        title="Stops"
        description={
          onTheRoad
            ? "In the order to run them. Tap Arrived when you get there and Departed when you leave."
            : "In the order to run them. Check-in opens once the load is dispatched."
        }
      >
        <ol className="flex flex-col gap-4">
          {load.stops.map((stop) => (
            <li key={stop.position} className="flex gap-3">
              <span
                className={
                  stop.kind === "pickup"
                    ? "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-sky-700 dark:text-sky-300"
                    : "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                }
              >
                {stop.kind === "pickup" ? (
                  <MapPin className="size-4" />
                ) : (
                  <PackageCheck className="size-4" />
                )}
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">
                  {stop.kind === "pickup" ? "Pickup" : "Delivery"}
                  {stop.stop_number && (
                    <span className="text-muted-foreground">
                      {" "}
                      · {stop.stop_number}
                    </span>
                  )}
                </p>
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(stop.location)}`}
                  className="block underline-offset-2 hover:underline"
                >
                  {stop.location}
                </a>
                <p className="text-muted-foreground">
                  {formatStopWindow(
                    stop.appointment_start,
                    stop.appointment_end
                  )}
                </p>
                {stop.notes && <p className="mt-1">{stop.notes}</p>}
                {(() => {
                  const current = liveStop(stop)
                  if (!live) return null
                  if (!current) {
                    return (
                      <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
                        This stop changed after the load was sent. Ask dispatch
                        to send it again before checking in.
                      </p>
                    )
                  }
                  return (
                    <StopCheckIn
                      token={token}
                      position={stop.position}
                      arrivedAt={current.arrived_at}
                      departedAt={current.departed_at}
                      open={onTheRoad}
                    />
                  )
                })()}
              </div>
            </li>
          ))}
        </ol>
      </SettingsCard>

      {load.rate && (
        <SettingsCard title="Rate">
          <dl className="flex flex-col gap-2 text-sm">
            {load.rate.charges.map((charge, index) => (
              <div key={index} className="flex justify-between gap-4">
                <dt className="text-muted-foreground">
                  {CHARGE_KIND_LABELS[charge.kind] ?? charge.kind}
                  {charge.description && ` · ${charge.description}`}
                </dt>
                <dd className="tabular-nums">{formatRate(charge.amount)}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-4 border-t pt-2 font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatRate(load.rate.total)}</dd>
            </div>
            {load.rate.detention_rate != null && (
              <p className="text-muted-foreground">
                Detention {formatRate(load.rate.detention_rate)}/h after{" "}
                {load.rate.detention_free_hours ?? 0} free hours.
              </p>
            )}
          </dl>
        </SettingsCard>
      )}

      {load.notes && (
        <SettingsCard title="Notes">
          <p className="text-sm whitespace-pre-wrap">{load.notes}</p>
        </SettingsCard>
      )}
    </Frame>
  )
}
