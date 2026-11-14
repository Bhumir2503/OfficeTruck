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

const FILLED_LABELS: Record<FilledField, string> = {
  reference: "load number",
  reference_numbers: "reference numbers",
  equipment: "equipment",
  commodity: "commodity",
  weight_lbs: "weight",
  trailer_number: "trailer number",
  broker: "broker",
  rate_con_from: "sender",
  stops: "stops, appointments and numbers",
  charges: "charges",
  detention: "detention terms",
}

/** The person's local date, "YYYY-MM-DD", for rate con dates with no year. */
function localToday() {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/**
 * A card's description once AI has filled some of it in: which fields, so
 * the person checks them. Falls back to the usual description.
 */
function FilledNote({
  fill,
  fields,
  children,
}: {
  fill: RateConFill | null
  fields: FilledField[]
  children: React.ReactNode
}) {
  const filled = fields.filter((field) => fill?.filled.includes(field))
  if (!filled.length) return <>{children}</>
  const labels = filled.map((field) => FILLED_LABELS[field])
  const list =
    labels.length > 1
      ? `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`
      : labels[0]
  return (
    <span className="text-violet-700 dark:text-violet-300">
      AI filled in the {list} from the rate con. Check them before saving.
    </span>
  )
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

  // What AI read off the rate con. The editors are uncontrolled, so a new
  // fill remounts them (fillKey) with its values as their defaults. Nothing
  // is saved until the person checks the form and saves it.
  const [fill, setFill] = useState<RateConFill | null>(null)
  const [fillKey, setFillKey] = useState(0)
  const [reading, setReading] = useState(false)
  const [readError, setReadError] = useState<string | null>(null)
  // Which read is current, so a replaced or removed file's result is ignored.
  const readId = useRef(0)
  const formRef = useRef<HTMLFormElement>(null)

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
    setRateCon(file)
    void readFile(file)
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
  }

  // After a fill remounts the editors, re-check the form with the new values.
  useEffect(() => {
    if (fillKey === 0) return
    revalidate(formRef.current)
    // Only when a new fill lands; revalidate is a new function every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fillKey])

  return (
    <form ref={formRef} {...formProps} autoComplete="off">
      <fieldset
        disabled={pending}
        className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_24rem]"
      >
        <div className="flex min-w-0 flex-col gap-6">
          <SettingsCard
            title="Load"
            description={
              <FilledNote fill={fill} fields={LOAD_FIELDS}>
                From the rate con.
              </FilledNote>
            }
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
            title="Broker"
            description={
              <FilledNote fill={fill} fields={BROKER_FIELDS}>
                Who booked it, and who sent the rate con.
              </FilledNote>
            }
            action={<FilledBadge fill={fill} fields={BROKER_FIELDS} />}
            contentClassName="grid gap-5 sm:grid-cols-6"
          >
            <BrokerFields
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
            description={
              <FilledNote fill={fill} fields={["stops"]}>
                Every pickup and delivery, with its appointment and number.
              </FilledNote>
            }
            action={<FilledBadge fill={fill} fields={["stops"]} />}
          >
            <StopsEditor
              key={`stops-${fillKey}`}
              defaultStops={
                fill?.stops ?? [{ kind: "pickup" }, { kind: "delivery" }]
              }
              errors={errors}
              onUpdate={update}
            />
          </SettingsCard>

          <SettingsCard
            title="Charges"
            description={
              <FilledNote fill={fill} fields={CHARGE_FIELDS}>
                From the rate con. Accessorials run up on the road are added to
                the load later.
              </FilledNote>
            }
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

        {/* Beside the cards, the rate con and saving stay in view; on a
            phone they come after them. */}
        <aside className="flex flex-col gap-6 lg:sticky lg:top-6">
          <section className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs">
            <div className="px-5 pt-4 pb-5">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                New load
              </p>
              <h4 className="mt-1 text-xl font-semibold tracking-tight">
                Start with the rate con
              </h4>
              <p className="mt-2 text-sm text-muted-foreground">
                Upload the broker&apos;s rate con and AI fills in the load for
                you: broker, stops, charges and more. Check it over, then save.
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
                  <span className="mt-2 flex items-center gap-1.5 text-xs text-violet-700 dark:text-violet-300">
                    <Sparkles className="size-3.5" />
                    AI fills in the load from it
                  </span>
                </button>
              )}
              {rateCon && reading && (
                <p
                  role="status"
                  className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <Loader2 className="size-4 animate-spin" />
                  Reading the rate con…
                </p>
              )}
              {rateCon && !reading && readError && (
                <div
                  role="alert"
                  className="mt-3 flex flex-col items-start gap-1 text-sm text-amber-700 dark:text-amber-300"
                >
                  <p>{readError}</p>
                  <Button
                    type="button"
                    variant="link"
                    size="xs"
                    className="h-auto px-0"
                    onClick={() => void readFile(rateCon)}
                  >
                    Try reading it again
                  </Button>
                </div>
              )}
              {rateCon && !reading && !readError && fill && (
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
                <p className="text-center text-xs text-muted-foreground">
                  The rate con is saved with the load.
                </p>
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
