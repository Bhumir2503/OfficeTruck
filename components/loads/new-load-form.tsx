"use client"

import { cn } from "cn"
import { CheckCircle2, Circle, CornerDownLeft, Upload, X } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { createLoad } from "@/app/org/[slug]/loads/actions"
import { SettingsCard } from "@/components/settings/settings-card"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { BrokerFields } from "@/components/loads/broker-fields"
import { DocumentLink } from "@/components/loads/document-viewer"
import { ChargesEditor } from "@/components/loads/charges-editor"
import { FreightFields, LoadTextField } from "@/components/loads/freight-fields"
import { StopsEditor } from "@/components/loads/stops-editor"
import { TruckSelect } from "@/components/loads/truck-select"
import {
  DriverSelect,
  handleMilesInput,
} from "@/components/loads/driver-select"
import { useZodForm } from "@/hooks/use-zod-form"
import type { BrokerOption } from "@/lib/brokers"
import { driverPay, formatPay } from "@/lib/driver-format"
import type { DriverOption } from "@/lib/drivers"
import {
  DOCUMENT_TYPES,
  documentFileError,
  uploadLoadDocument,
} from "@/lib/load-document-upload"
import { formatRate } from "@/lib/load-format"
import type { TruckOption } from "@/lib/trucks"
import { loadSchema } from "@/lib/schemas/load"

const TextField = LoadTextField

/** "2,450.50" or "$1,240" → a number, or 0 when blank or not a number. */
const amount = (value: FormDataEntryValue | null) => {
  const number = Number(String(value ?? "").replace(/[$,\s]/g, ""))
  return Number.isFinite(number) ? number : 0
}
const miles = (value: FormDataEntryValue | null) => {
  const text = String(value ?? "").replace(/[,\s]/g, "")
  return text ? Number(text) : null
}

/** Revenue and miles as the form stands, for the Money preview. */
function readPreview(form: HTMLFormElement) {
  const data = new FormData(form)
  let revenue = 0
  for (const [key, value] of data) {
    if (/^charges\.\d+\.amount$/.test(key)) revenue += amount(value)
  }
  return {
    revenue,
    miles: miles(data.get("miles")),
    emptyMiles: miles(data.get("empty_miles")),
  }
}

export function NewLoadForm({
  organizationId,
  base,
  drivers,
  driversHref,
  trucks,
  trucksHref,
  brokers,
  brokersHref,
  factoringName,
}: {
  organizationId: string
  /** /org/<slug>/loads */
  base: string
  drivers: DriverOption[]
  /** /org/<slug>/drivers */
  driversHref: string
  trucks: TruckOption[]
  /** /org/<slug>/equipment */
  trucksHref: string
  brokers: BrokerOption[]
  /** /org/<slug>/brokers */
  brokersHref: string
  factoringName: string | null
}) {
  const router = useRouter()
  const [driverId, setDriverId] = useState<string | null>(null)
  const [driverPicked, setDriverPicked] = useState(false)
  // The rate con, held here until the load is saved, and a local link to
  // open it while filling in the form.
  const [rateCon, setRateCon] = useState<File | null>(null)
  const [rateConUrl, setRateConUrl] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const rateConInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!rateCon) return
    const url = URL.createObjectURL(rateCon)
    // Set after the file is picked; revoked when it's replaced or removed.
    const timer = setTimeout(() => setRateConUrl(url), 0)
    return () => {
      clearTimeout(timer)
      URL.revokeObjectURL(url)
      setRateConUrl(null)
    }
  }, [rateCon])

  function pickRateCon(file: File | undefined) {
    if (!file) return
    const problem = documentFileError(file)
    if (problem) {
      toast.error(problem)
      return
    }
    setRateCon(file)
  }

  // What the Money panel shows, read from the form as it's filled in.
  const [preview, setPreview] = useState({
    revenue: 0,
    miles: null as number | null,
    emptyMiles: null as number | null,
  })
  const { errors, formError, pending, formProps, revalidate } = useZodForm(
    loadSchema,
    async (values) => {
      const result = await createLoad(organizationId, values)
      if ("error" in result) {
        return result.error
      }
      // The rate con goes on as the load's first document.
      if (rateCon) {
        const problem = await uploadLoadDocument(
          organizationId,
          result.id,
          "rate_con",
          rateCon
        )
        if (problem) {
          toast.warning(
            `Load ${values.reference} added, but the rate con didn't upload: ${problem} Add it from the load.`
          )
        } else {
          toast.success(`Load ${values.reference} added with its rate con.`)
        }
      } else {
        toast.success(`Load ${values.reference} added.`)
      }
      if (result.warning) {
        toast.warning(result.warning)
      }
      router.push(`${base}/${result.id}`)
    }
  )

  // Custom controls (pickers, charge lines) don't fire the form's change
  // event, so they call this to re-check the form and refresh the preview.
  function update(form: HTMLFormElement | null) {
    revalidate(form)
    if (form) setPreview(readPreview(form))
  }

  const driver = drivers.find((option) => option.id === driverId) ?? null
  const pay = driver
    ? driverPay(driver, { rate: preview.revenue, miles: preview.miles })
    : null
  const rate = driver ? formatPay(driver.pay_type, driver.pay_rate) : null
  const allMiles = (preview.miles ?? 0) + (preview.emptyMiles ?? 0)

  return (
    <form
      {...formProps}
      onChange={(event) => {
        formProps.onChange(event)
        setPreview(readPreview(event.currentTarget))
      }}
      autoComplete="off"
    >
      <fieldset
        disabled={pending}
        className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_24rem]"
      >
        <div className="flex min-w-0 flex-col gap-6">
          <SettingsCard
            title="Load"
            description="From the rate con."
            contentClassName="grid gap-5 sm:grid-cols-6"
          >
            <TextField
              name="reference"
              label="Load number"
              placeholder="e.g. 4471023"
              errors={errors}
              className="sm:col-span-6"
              autoFocus
            />
            <FreightFields errors={errors} onUpdate={update} />
            <Field data-invalid={!!errors.notes} className="sm:col-span-6">
              <FieldLabel htmlFor="load-notes">Notes</FieldLabel>
              <Textarea
                id="load-notes"
                name="notes"
                rows={3}
                placeholder="Special instructions, gate codes…"
                aria-invalid={!!errors.notes}
              />
              <FieldError errors={errors.notes} />
            </Field>
          </SettingsCard>

          <SettingsCard
            title="Broker"
            description="Who booked it, and who sent the rate con."
            contentClassName="grid gap-5 sm:grid-cols-6"
          >
            <BrokerFields
              brokers={brokers}
              brokersHref={brokersHref}
              factoringName={factoringName}
              errors={errors}
              onUpdate={update}
            />
          </SettingsCard>

          <SettingsCard
            title="Stops"
            description="Every pickup and delivery, with its appointment and number."
          >
            <StopsEditor
              defaultStops={[{ kind: "pickup" }, { kind: "delivery" }]}
              errors={errors}
              onUpdate={update}
            />
          </SettingsCard>

          <SettingsCard
            title="Charges"
            description="From the rate con. Accessorials run up on the road are added to the load later."
          >
            <ChargesEditor
              defaultCharges={[
                { kind: "linehaul" },
                { kind: "fuel_surcharge" },
              ]}
              errors={errors}
              onUpdate={update}
            />
          </SettingsCard>

          <SettingsCard
            title="Assignment"
            description="Truck and driver can stay empty until the load is dispatched."
            contentClassName="grid gap-5 sm:grid-cols-2"
          >
            <Field data-invalid={!!errors.truck_id}>
              <FieldLabel htmlFor="load-truck-id">Truck</FieldLabel>
              <TruckSelect
                id="load-truck-id"
                trucks={trucks}
                invalid={!!errors.truck_id}
                onPick={(truck) => {
                  // Prefill the truck's usual driver, unless one was picked by hand.
                  if (!driverPicked && truck?.default_driver_id) {
                    setDriverId(truck.default_driver_id)
                  }
                }}
                onUpdate={update}
              />
              {errors.truck_id ? (
                <FieldError errors={errors.truck_id} />
              ) : (
                trucks.length === 0 && (
                  <FieldDescription>
                    <Link href={trucksHref} className="underline">
                      Add trucks
                    </Link>{" "}
                    to pick them here.
                  </FieldDescription>
                )
              )}
            </Field>
            <Field data-invalid={!!errors.driver_id}>
              <FieldLabel htmlFor="load-driver-id">Driver</FieldLabel>
              <DriverSelect
                id="load-driver-id"
                drivers={drivers}
                value={driverId}
                onValueChange={(value) => {
                  setDriverId(value)
                  setDriverPicked(true)
                }}
                invalid={!!errors.driver_id}
                onUpdate={update}
              />
              {errors.driver_id ? (
                <FieldError errors={errors.driver_id} />
              ) : (
                drivers.length === 0 && (
                  <FieldDescription>
                    <Link href={driversHref} className="underline">
                      Add drivers
                    </Link>{" "}
                    to pick them here.
                  </FieldDescription>
                )
              )}
            </Field>
            <TextField
              name="miles"
              label="Loaded miles"
              inputMode="numeric"
              placeholder="e.g. 1,240"
              errors={errors}
              onChange={handleMilesInput}
            />
            <TextField
              name="empty_miles"
              label="Empty miles"
              inputMode="numeric"
              placeholder="e.g. 85"
              errors={errors}
              onChange={handleMilesInput}
            />
          </SettingsCard>
        </div>

        {/* Like the load page: beside the cards, saving and the money stay
            in view; on a phone they come after them. */}
        <aside className="flex flex-col gap-6 lg:sticky lg:top-6">
          <section className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs">
            <div className="px-5 pt-4 pb-5">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                New load
              </p>
              <h4 className="mt-1 text-lg font-semibold tracking-tight">
                Start with the rate con
              </h4>
              <p className="mt-1 text-sm text-muted-foreground">
                Add the broker&apos;s rate con, then fill in the load from it.
                It&apos;s saved with the load.
              </p>
              <input
                ref={rateConInput}
                type="file"
                accept={DOCUMENT_TYPES.join(",")}
                className="hidden"
                onChange={(event) => {
                  pickRateCon(event.currentTarget.files?.[0])
                  event.currentTarget.value = ""
                }}
              />
              {rateCon ? (
                <div className="mt-4 flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                  {rateConUrl ? (
                    <DocumentLink
                      file={{
                        url: rateConUrl,
                        name: rateCon.name,
                        type: rateCon.type,
                      }}
                      className="text-foreground"
                    />
                  ) : (
                    <span className="truncate">{rateCon.name}</span>
                  )}
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => rateConInput.current?.click()}
                    >
                      Replace
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Remove the rate con"
                      onClick={() => setRateCon(null)}
                    >
                      <X />
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => rateConInput.current?.click()}
                  onDragOver={(event) => {
                    event.preventDefault()
                    setDragging(true)
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault()
                    setDragging(false)
                    pickRateCon(event.dataTransfer.files?.[0])
                  }}
                  className={cn(
                    "mt-4 flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 py-6 text-center text-sm transition-colors hover:bg-muted/50",
                    dragging && "border-primary bg-primary/5"
                  )}
                >
                  <Upload className="size-5 text-muted-foreground" />
                  <span className="font-medium">Upload the rate con</span>
                  <span className="text-xs text-muted-foreground">
                    Drop a PDF or photo here, or click to choose
                  </span>
                </button>
              )}
              <div className="mt-4 flex flex-col gap-2">
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  variant={rateCon ? "default" : "outline"}
                  disabled={pending}
                >
                  {pending
                    ? "Saving…"
                    : rateCon
                      ? "Save load"
                      : "Save without a rate con"}{" "}
                  <CornerDownLeft />
                </Button>
                <Link
                  href={base}
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  Cancel
                </Link>
              </div>
              {formError && (
                <p role="alert" className="mt-3 text-sm text-destructive">
                  {formError}
                </p>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border bg-card px-5 py-4 text-card-foreground shadow-xs">
            <h4 className="font-semibold">Documents</h4>
            <ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
              {["Rate con", "BOL", "POD"].map((label) => (
                <li key={label} className="flex items-center gap-2">
                  {label === "Rate con" && rateCon ? (
                    <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Circle className="size-4" />
                  )}
                  <span
                    className={cn(
                      label === "Rate con" &&
                        rateCon &&
                        "font-medium text-foreground"
                    )}
                  >
                    {label}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              The BOL and POD are added on the load once it&apos;s on the road.
            </p>
          </section>

          <section className="overflow-hidden rounded-xl border bg-card px-5 py-4 text-card-foreground shadow-xs">
            <h4 className="font-semibold">Money</h4>
            <dl className="mt-3 flex flex-col gap-2 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt>Revenue</dt>
                <dd className="tabular-nums">{formatRate(preview.revenue)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 text-muted-foreground">
                <dt>{rate ? `Driver pay (${rate})` : "Driver pay"}</dt>
                <dd className="text-right tabular-nums">
                  {pay === null
                    ? driver
                      ? "Add miles or a rate"
                      : "No driver yet"
                    : `−${formatRate(pay)}`}
                </dd>
              </div>
              <div className="my-1 border-t" />
              <div className="flex items-baseline justify-between gap-3 text-base font-semibold">
                <dt>Margin</dt>
                <dd className="tabular-nums">
                  {pay === null ? "—" : formatRate(preview.revenue - pay)}
                </dd>
              </div>
              <p className="text-xs text-muted-foreground">
                Before fuel and fixed costs.
              </p>
              <p className="mt-1 text-sm text-muted-foreground tabular-nums">
                {preview.miles && preview.revenue ? (
                  <>
                    {formatRate(preview.revenue / preview.miles)} per loaded
                    mile
                    {preview.emptyMiles ? (
                      <>
                        {" · "}
                        {formatRate(preview.revenue / allMiles)} per mile all-in
                      </>
                    ) : null}
                  </>
                ) : (
                  "Add the charges and miles to see the rate per mile."
                )}
              </p>
            </dl>
          </section>
        </aside>
      </fieldset>
    </form>
  )
}
