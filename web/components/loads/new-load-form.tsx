"use client"

import { cn } from "cn"
import { CornerDownLeft, Loader2, Sparkles, Upload, X } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { createLoad } from "@/app/org/[slug]/loads/actions"
import { readRateConFile } from "@/app/org/[slug]/loads/rate-con-actions"
import { SettingsCard } from "@/components/settings/settings-card"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { AiFillOverlay } from "@/components/loads/ai-fill-overlay"
import { BrokerFields } from "@/components/loads/broker-fields"
import { DocumentLink } from "@/components/loads/document-viewer"
import { ChargesEditor } from "@/components/loads/charges-editor"
import { FreightFields, LoadTextField } from "@/components/loads/freight-fields"
import { EmptyMilesField } from "@/components/loads/empty-miles-field"
import { RouteMilesField } from "@/components/loads/route-miles-field"
import { StopsEditor } from "@/components/loads/stops-editor"
import { TruckSelect } from "@/components/loads/truck-select"
import { DriverSelect } from "@/components/loads/driver-select"
import {
  AssignmentSuggestions,
  type PlanInput,
  useAssignmentPlan,
} from "@/components/loads/assignment-suggestions"
import { ComplianceWarning } from "@/components/loads/compliance-warning"
import { useZodForm } from "@/hooks/use-zod-form"
import type { BrokerOption } from "@/lib/brokers"
import type { DriverOption } from "@/lib/drivers"
import {
  DOCUMENT_TYPES,
  documentFileError,
  shrink,
  uploadLoadDocument,
} from "@/lib/load-document-upload"
import type { TruckOption } from "@/lib/trucks"
import {
  type FilledField,
  type RateConFill,
  rateConToForm,
} from "@/lib/rate-con-format"
import { loadSchema } from "@/lib/schemas/load"

const TextField = LoadTextField

const LOAD_FIELDS: FilledField[] = [
  "reference",
  "reference_numbers",
  "equipment",
  "commodity",
  "weight_lbs",
  "trailer_number",
]
const BROKER_FIELDS: FilledField[] = ["broker", "rate_con_from"]
const CHARGE_FIELDS: FilledField[] = ["charges", "detention"]

/** The person's local date, "YYYY-MM-DD", for rate con dates with no year. */
/** The latest day among the form's stop appointments, "YYYY-MM-DD". */
function lastStopDay(form: HTMLFormElement | null) {
  const days = Array.from(
    form?.querySelectorAll<HTMLInputElement>(
      'input[name^="stops."][name$=".appointment_start"], input[name^="stops."][name$=".appointment_end"]'
    ) ?? []
  )
    .map((input) => input.value.slice(0, 10))
    .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day))
    .sort()
  return days.at(-1) ?? null
}

/** What to plan the assignment from: the first pickup and the last stop. */
function planFrom(form: HTMLFormElement | null): PlanInput | null {
  const value = (name: string) =>
    form?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value ?? ""
  const location = value("stops.0.location").trim()
  const start = value("stops.0.appointment_start")
  if (!location || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(start)) return null
  const last = Array.from(
    form?.querySelectorAll<HTMLInputElement>(
      'input[name^="stops."][name$=".appointment_start"], input[name^="stops."][name$=".appointment_end"]'
    ) ?? []
  )
    .map((input) => input.value.slice(0, 16))
    .filter((time) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(time))
    .sort()
    .at(-1)
  return {
    pickupLocation: location,
    pickupStart: start.slice(0, 16),
    deliveryEnd: last ?? null,
  }
}

function localToday() {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function FilledBadge({
  fill,
  fields,
}: {
  fill: RateConFill | null
  fields: FilledField[]
}) {
  if (!fields.some((field) => fill?.filled.includes(field))) return null
  return (
    <Badge
      variant="outline"
      className="border-violet-300 text-violet-700 dark:border-violet-700 dark:text-violet-300"
    >
      <Sparkles />
      Filled by AI
    </Badge>
  )
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
  /** /org/<slug>/customers */
  brokersHref: string
  factoringName: string | null
}) {
  const router = useRouter()
  const [driverId, setDriverId] = useState<string | null>(null)
  const [truckId, setTruckId] = useState<string | null>(null)
  const [driverPicked, setDriverPicked] = useState(false)
  // The last stop's day, to warn about a CDL or medical card that runs out
  // before the load is done.
  const [until, setUntil] = useState<string | null>(null)
  // The pickup and last stop to find the best truck and driver for.
  const [planInput, setPlanInput] = useState<PlanInput | null>(null)
  const notePlan = (form: HTMLFormElement | null) => {
    const next = planFrom(form)
    setPlanInput((current) =>
      JSON.stringify(current) === JSON.stringify(next) ? current : next
    )
  }
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

  // What AI read off the rate con. The editors are uncontrolled, so a new
  // fill remounts them (fillKey) with its values as their defaults. Nothing
  // is saved until the person checks the form and saves it.
  const [fill, setFill] = useState<RateConFill | null>(null)
  const [fillKey, setFillKey] = useState(0)
  const [reading, setReading] = useState(false)
  const [readError, setReadError] = useState<string | null>(null)
  // The file AI last filled the form from, so the button hides until the
  // rate con is replaced.
  const [filledFrom, setFilledFrom] = useState<File | null>(null)
  // Which read is current, so a replaced or removed file's result is ignored.
  const readId = useRef(0)
  const formRef = useRef<HTMLFormElement>(null)
  const plan = useAssignmentPlan(organizationId, planInput, { delay: 800 })
  // Bumped when stops change, so loaded miles are worked out again.
  const [stopsVersion, setStopsVersion] = useState(0)
  const stopsChanged = () => {
    setStopsVersion((version) => version + 1)
    notePlan(formRef.current)
  }
  /** The first stop in the form: where empty miles end. */
  const firstPickup = () => {
    const field = (name: string) =>
      formRef.current?.querySelector<HTMLInputElement>(
        `input[name="stops.0.${name}"]`
      )?.value ?? ""
    return {
      location: field("location"),
      start: field("appointment_start") || null,
    }
  }
  /** The stop addresses in the form, in order. */
  const stopAddresses = () =>
    Array.from(
      formRef.current?.querySelectorAll<HTMLInputElement>(
        'input[name^="stops."][name$=".location"]'
      ) ?? []
    ).map((input) => input.value)

  async function readFile(file: File) {
    const id = ++readId.current
    setReading(true)
    setReadError(null)
    let problem: string | null = null
    try {
      // Photos are shrunk to WebP first, as they are when saved.
      let body: Blob = file
      if (file.type !== "application/pdf") {
        try {
          body = await shrink(file)
        } catch {
          problem =
            "This photo can't be read here. Save it as a JPG and try again, or fill in the load by hand."
        }
      }
      if (!problem) {
        const data = new FormData()
        data.set(
          "file",
          body,
          file.type === "application/pdf" ? file.name : "rate-con.webp"
        )
        data.set("today", localToday())
        const result = await readRateConFile(organizationId, data)
        if (id !== readId.current) return
        if (!result.ok) {
          problem = result.error
        } else {
          const next = rateConToForm(result.extraction, brokers)
          if (next.filled.length === 0) {
            problem =
              "Nothing could be read off this file. Fill in the load by hand."
          } else {
            setFill(next)
            setFillKey((key) => key + 1)
            // A fill brings new stops: work the miles out from them.
            stopsChanged()
            setFilledFrom(file)
          }
        }
      }
    } catch {
      problem =
        "The rate con couldn't be read right now. Fill in the load by hand, or try again."
    }
    if (id !== readId.current) return
    setReadError(problem)
    setReading(false)
  }

  function pickRateCon(file: File | undefined) {
    if (!file) return
    const problem = documentFileError(file)
    if (problem) {
      toast.error(problem)
      return
    }
    // Attaching the rate con doesn't read it: the person chooses whether AI
    // fills in the form.
    readId.current++
    setReading(false)
    setReadError(null)
    setRateCon(file)
  }

  // Stops waiting on the read; its result is ignored when it comes back.
  function cancelRead() {
    readId.current++
    setReading(false)
    setReadError(null)
  }

  function removeRateCon() {
    readId.current++
    setReading(false)
    setReadError(null)
    setRateCon(null)
  }

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
  // event, so they call this to re-check the form.
  function update(form: HTMLFormElement | null) {
    revalidate(form)
    setUntil(lastStopDay(form))
    notePlan(form)
  }

  // After a fill remounts the editors, re-check the form with the new values.
  useEffect(() => {
    if (fillKey === 0) return
    update(formRef.current)
    // Only when a new fill lands; revalidate is a new function every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fillKey])

  return (
    <form ref={formRef} {...formProps} autoComplete="off">
      <fieldset
        disabled={pending}
        className="grid items-start gap-6 @4xl/main:grid-cols-[minmax(0,1fr)_20rem] @6xl/main:grid-cols-[minmax(0,1fr)_24rem]"
      >
        <div className="relative min-w-0">
          {reading && <AiFillOverlay onCancel={cancelRead} />}
          <div
            inert={reading}
            aria-busy={reading}
            className="flex min-w-0 flex-col gap-6"
          >
            <SettingsCard
              title="Load"
              description="From the rate con."
              action={<FilledBadge fill={fill} fields={LOAD_FIELDS} />}
              contentClassName="grid gap-5 sm:grid-cols-6"
            >
              <TextField
                key={`reference-${fillKey}`}
                defaultValue={fill?.reference ?? undefined}
                name="reference"
                label="Load number"
                placeholder="e.g. 4471023"
                errors={errors}
                className="sm:col-span-6"
                autoFocus
              />
              <FreightFields
                key={`freight-${fillKey}`}
                defaults={fill?.freight}
                errors={errors}
                onUpdate={update}
              />
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
              title="Customer"
              description="Who booked it, and who sent the rate con."
              action={<FilledBadge fill={fill} fields={BROKER_FIELDS} />}
              contentClassName="grid gap-5 sm:grid-cols-6"
            >
              <BrokerFields
                organizationId={organizationId}
                key={`broker-${fillKey}`}
                defaults={fill?.broker ?? undefined}
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
              action={<FilledBadge fill={fill} fields={["stops"]} />}
            >
              <StopsEditor
                key={`stops-${fillKey}`}
                defaultStops={
                  fill?.stops ?? [
                    { kind: "pickup", appointment_type: "appointment" },
                    { kind: "delivery", appointment_type: "appointment" },
                  ]
                }
                errors={errors}
                onUpdate={update}
                onStopsChange={stopsChanged}
              />
            </SettingsCard>

            <SettingsCard
              title="Charges"
              description="From the rate con. Accessorials run up on the road are added to the load later."
              action={<FilledBadge fill={fill} fields={CHARGE_FIELDS} />}
            >
              <ChargesEditor
                key={`charges-${fillKey}`}
                defaultCharges={
                  fill?.charges ?? [
                    { kind: "linehaul" },
                    { kind: "fuel_surcharge" },
                  ]
                }
                defaultDetention={fill?.detention ?? undefined}
                errors={errors}
                onUpdate={update}
              />
            </SettingsCard>

            <SettingsCard
              title="Assignment"
              description="Truck and driver can stay empty until the load is dispatched."
              contentClassName="grid gap-5 sm:grid-cols-2"
            >
              <div className="sm:col-span-2">
                <AssignmentSuggestions
                  {...plan}
                  onRefresh={() => void plan.refresh()}
                  trucks={trucks}
                  drivers={drivers}
                  truckId={truckId}
                  driverId={driverId}
                  onUse={(truck, driver) => {
                    setTruckId(truck)
                    setDriverId(driver)
                    setDriverPicked(true)
                  }}
                />
              </div>
              <Field data-invalid={!!errors.truck_id}>
                <FieldLabel htmlFor="load-truck-id">Truck</FieldLabel>
                <TruckSelect
                  id="load-truck-id"
                  trucks={trucks}
                  organizationId={organizationId}
                  load={{ pickup: firstPickup }}
                  value={truckId}
                  points={plan.plan?.points}
                  until={until}
                  invalid={!!errors.truck_id}
                  onPick={(truck) => {
                    setTruckId(truck?.id ?? null)
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
                  until={until}
                  availability={plan.plan?.drivers}
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
              <div className="empty:hidden sm:col-span-2">
                <ComplianceWarning
                  driver={drivers.find((driver) => driver.id === driverId)}
                  truck={trucks.find((truck) => truck.id === truckId)}
                  until={until}
                  driversBase={driversHref}
                  trucksBase={trucksHref}
                />
              </div>
              <RouteMilesField
                organizationId={organizationId}
                addresses={stopAddresses}
                stopsVersion={stopsVersion}
                errors={errors.miles}
              />
              <EmptyMilesField
                organizationId={organizationId}
                truckId={truckId}
                pickup={firstPickup}
                stopsVersion={stopsVersion}
                errors={errors.empty_miles}
                trucksBase={trucksHref}
              />
            </SettingsCard>
          </div>
        </div>

        {/* Beside the cards, the rate con and saving stay in view; on a
            phone they come after them. */}
        <aside className="flex flex-col gap-6 @4xl/main:sticky @4xl/main:top-6">
          <section className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs">
            <div className="px-5 pt-4 pb-5">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                New load
              </p>
              <h4 className="mt-1 text-xl font-semibold tracking-tight">
                Start with the rate con
              </h4>
              <p className="mt-2 text-sm text-muted-foreground">
                Upload the broker&apos;s rate con, then fill in the load
                yourself or let AI do it for you. Either way, check it over
                before saving.
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
                      onClick={removeRateCon}
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
                    "mt-5 flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-primary/40 bg-primary/[0.03] px-4 py-12 text-center text-sm transition-colors hover:border-primary hover:bg-primary/5",
                    dragging && "border-primary bg-primary/10"
                  )}
                >
                  <span className="mb-1 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Upload className="size-6" />
                  </span>
                  <span className="text-base font-medium">
                    Drop the rate con here
                  </span>
                  <span className="text-muted-foreground">
                    PDF or photo, or click to choose
                  </span>
                </button>
              )}
              {rateCon && filledFrom !== rateCon && (
                <div className="mt-3 flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-violet-300 text-violet-700 hover:bg-violet-50 hover:text-violet-800 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-950"
                    disabled={reading}
                    onClick={() => void readFile(rateCon)}
                  >
                    {reading ? (
                      <>
                        <Loader2 className="animate-spin" />
                        <span role="status">Reading the rate con…</span>
                      </>
                    ) : (
                      <>
                        <Sparkles />
                        {readError ? "Try again with AI" : "Fill in with AI"}
                      </>
                    )}
                  </Button>
                  {readError && !reading ? (
                    <p
                      role="alert"
                      className="text-sm text-amber-700 dark:text-amber-300"
                    >
                      {readError}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Reads the rate con and fills in the form for you to check.
                      Replaces anything already typed.
                    </p>
                  )}
                </div>
              )}
              {rateCon && filledFrom === rateCon && (
                <p className="mt-3 flex items-start gap-2 text-sm text-violet-700 dark:text-violet-300">
                  <Sparkles className="mt-0.5 size-4 shrink-0" />
                  <span>
                    AI filled in the load from the rate con. Check each part
                    marked &ldquo;Filled by AI&rdquo; before saving.
                  </span>
                </p>
              )}
              <div className="mt-5 flex flex-col gap-2 border-t pt-5">
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
        </aside>
      </fieldset>
    </form>
  )
}
