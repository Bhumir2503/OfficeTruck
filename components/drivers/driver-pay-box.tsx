"use client"

import { RefreshCw } from "lucide-react"
import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import {
  applyRateToUpcomingLoads,
  updateDriverPay,
} from "@/app/org/[slug]/drivers/actions"
import { PayFields } from "@/components/drivers/pay-fields"
import { Button } from "@/components/ui/button"
import type { PayType } from "@/lib/schemas/driver"

function payValues(form: HTMLFormElement | null) {
  const data = form ? new FormData(form) : null
  return {
    pay_type: String(data?.get("pay_type") ?? ""),
    pay_rate: String(data?.get("pay_rate") ?? "").replaceAll(",", ""),
  }
}

/**
 * How the driver is paid, beside the driver page, saved on its own. Owners
 * and admins only. When upcoming loads are still locked at an older rate,
 * it offers to move them onto the current one.
 */
export function DriverPayBox({
  organizationId,
  driverId,
  payType,
  payRate,
  currentRate,
  stale,
}: {
  organizationId: string
  driverId: string
  payType: PayType | null
  payRate: number | null
  /** "$0.65 / mile", or null when pay isn't set. */
  currentRate: string | null
  /** Booked or dispatched loads on another rate, with the rate each is locked at. */
  stale: { reference: string; locked: string }[]
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [saving, startSave] = useTransition()
  const [applying, startApply] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [changed, setChanged] = useState(false)
  // Remounts the fields on Cancel, back to the saved values.
  const [version, setVersion] = useState(0)

  const saved = {
    pay_type: payType ?? "",
    pay_rate: payType && payRate !== null ? String(Number(payRate)) : "",
  }

  function check(form: HTMLFormElement | null) {
    const now = payValues(form)
    const rate = now.pay_type ? now.pay_rate : ""
    setChanged(
      now.pay_type !== saved.pay_type ||
        (rate === "" ? "" : String(Number(rate))) !== saved.pay_rate
    )
    setError(null)
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = payValues(event.currentTarget)
    startSave(async () => {
      const result = await updateDriverPay(organizationId, driverId, values)
      if ("error" in result) {
        setError(result.error)
        return
      }
      setChanged(false)
      toast.success("Pay saved.")
      router.refresh()
    })
  }

  function apply() {
    startApply(async () => {
      const result = await applyRateToUpcomingLoads(organizationId, driverId)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success(
        result.changed === 0
          ? "Those loads are already on the current rate."
          : `${result.changed} upcoming ${result.changed === 1 ? "load" : "loads"} now ${result.changed === 1 ? "pays" : "pay"} ${currentRate}.`
      )
      router.refresh()
    })
  }

  const count = stale.length

  return (
    <section className="shrink-0 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs">
      <form
        ref={formRef}
        onSubmit={save}
        onChange={(event) => check(event.currentTarget)}
        autoComplete="off"
        className="flex flex-col gap-4 px-5 pt-4 pb-5"
      >
        <h4 className="font-semibold">Pay</h4>
        <fieldset disabled={saving} className="flex flex-col gap-4">
          <PayFields
            key={version}
            defaultType={payType}
            defaultRate={payRate}
            errors={{}}
            onUpdate={check}
          />
        </fieldset>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {changed && (
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={saving}
              onClick={() => {
                setVersion((v) => v + 1)
                setChanged(false)
                setError(null)
              }}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        )}
      </form>
      {count > 0 && currentRate && !changed && (
        <div className="flex flex-col gap-3 border-t bg-muted/30 px-5 py-4">
          <p className="text-sm">
            {count} upcoming {count === 1 ? "load is" : "loads are"} still
            locked at an older rate.
          </p>
          <ul className="flex flex-wrap gap-1.5 text-xs">
            {stale.map((load) => (
              <li
                key={load.reference}
                className="rounded-md border bg-background px-2 py-0.5"
              >
                <span className="font-medium">{load.reference}</span>{" "}
                <span className="text-muted-foreground">at {load.locked}</span>
              </li>
            ))}
          </ul>
          <Button
            size="sm"
            variant="outline"
            disabled={applying}
            onClick={apply}
            className="self-start"
          >
            <RefreshCw className={applying ? "animate-spin" : undefined} />
            {applying ? "Applying…" : `Apply ${currentRate}`}
          </Button>
          <p className="text-xs text-muted-foreground">
            Loads in transit, delivered or invoiced keep their rate.
          </p>
        </div>
      )}
    </section>
  )
}
