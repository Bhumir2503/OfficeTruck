"use client"

import { cn } from "cn"

import {
  CornerDownLeft,
  FileText,
  IdCard,
  Pencil,
  Plus,
  Upload,
  X,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import {
  createDriver,
  renameDriverDocument,
  updateDriver,
  updateDriverNotes,
} from "@/app/org/[slug]/drivers/actions"
import { DateField } from "@/components/drivers/date-field"
import {
  type DocFiles,
  PendingCopyField,
} from "@/components/drivers/pending-copy-field"
import { PayFields } from "@/components/drivers/pay-fields"
import { StaleRateNotice } from "@/components/drivers/stale-rate-notice"
import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import { AddRecordPanel } from "@/components/add-record-panel"
import { LeaveGuard } from "@/components/leave-guard"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useZodForm } from "@/hooks/use-zod-form"
import { DRIVER_CARD_IDS, DRIVER_CDL_ID } from "@/lib/driver-format"
import { FILE_TYPES, uploadDriverDocument } from "@/lib/driver-document-upload"
import type { Driver } from "@/lib/drivers"
import { formatPhone, handlePhoneInput, handlePhoneKeyDown } from "@/lib/phone"
import {
  CDL_CLASSES,
  CDL_CLASS_LABELS,
  CDL_ENDORSEMENTS,
  CDL_ENDORSEMENT_LABELS,
  driverSchema,
  type CdlEndorsement,
  type DriverInput,
} from "@/lib/schemas/driver"
import { US_STATES } from "@/lib/schemas/organization"

type Name = keyof DriverInput

/** The Pay and Notes cards on Add driver, for the panel's links. */
const PAY_CARD_ID = "pay-card"
const NOTES_CARD_ID = "notes-card"
export type DriverFormCard = "details" | "cdl" | "medical" | "pay" | "notes"
type Errors = Partial<Record<Name, { message: string }[]>>

const fieldId = (name: Name) => `driver-${name.replaceAll("_", "-")}`

function TextField({
  name,
  label,
  errors,
  hint,
  className,
  ...input
}: {
  name: Name
  label: string
  errors: Errors
  hint?: string
  className?: string
} & Omit<React.ComponentProps<"input">, "name" | "className">) {
  const id = fieldId(name)
  const fieldErrors = errors[name]
  return (
    <Field data-invalid={!!fieldErrors} className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} name={name} aria-invalid={!!fieldErrors} {...input} />
      {fieldErrors ? (
        <FieldError errors={fieldErrors} />
      ) : (
        hint && <FieldDescription>{hint}</FieldDescription>
      )}
    </Field>
  )
}

/** Each field's value, to compare against what was loaded. */
function snapshot(form: HTMLFormElement | null) {
  const values = new Map<string, string>()
  if (form) {
    const data = new FormData(form)
    for (const name of new Set(data.keys())) {
      values.set(
        name,
        data
          .getAll(name)
          .map((value) => (typeof value === "string" ? value : value.name))
          .join("\u0000")
      )
    }
  }
  return values
}

/** The card an element (or the field with this name) sits in. */
function cardOf(from: Element | HTMLFormElement, name?: string) {
  let element: Element | null = from
  if (name !== undefined) {
    const item = (from as HTMLFormElement).elements.namedItem(name)
    element = item instanceof RadioNodeList ? (item[0] as Element) : item
  }
  return element?.closest<HTMLElement>("[data-card]")?.dataset.card as
    DriverFormCard | undefined
}

function saveButton(form: HTMLFormElement, card: DriverFormCard) {
  return form.querySelector<HTMLButtonElement>(
    `[data-card="${card}"] button[type="submit"]`
  )
}

/**
 * The endorsements as checkboxes, kept in one hidden field ("H,N") so the
 * form sends them as a single value. `onUpdate` runs after a change, since
 * a field filled from state fires no change event of its own.
 */
function EndorsementsField({
  defaultValue,
  errors,
  onUpdate,
}: {
  defaultValue: CdlEndorsement[]
  errors?: { message: string }[]
  onUpdate: (form: HTMLFormElement | null) => void
}) {
  const [chosen, setChosen] = useState<CdlEndorsement[]>(defaultValue)
  const hiddenRef = useRef<HTMLInputElement>(null)
  const firstRender = useRef(true)
  const value = CDL_ENDORSEMENTS.filter((e) => chosen.includes(e)).join(",")

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    onUpdate(hiddenRef.current?.form ?? null)
    // Only when the value changes; onUpdate is a new function every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <fieldset className="grid gap-2 sm:col-span-6">
      <legend className="mb-1 text-sm font-medium">Endorsements</legend>
      <input
        ref={hiddenRef}
        type="hidden"
        name="cdl_endorsements"
        value={value}
      />
      <div className="flex flex-wrap gap-2">
        {CDL_ENDORSEMENTS.map((code) => (
          <label
            key={code}
            className="flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm has-checked:border-brand has-checked:bg-brand/10 has-checked:text-brand-ink"
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={chosen.includes(code)}
              onChange={(event) =>
                setChosen((current) =>
                  event.target.checked
                    ? [...current, code]
                    : current.filter((e) => e !== code)
                )
              }
            />
            <span className="font-semibold">{code}</span>
            <span className="text-muted-foreground">
              {CDL_ENDORSEMENT_LABELS[code]}
            </span>
          </label>
        ))}
      </div>
      {errors?.length ? <FieldError errors={errors} /> : null}
    </fieldset>
  )
}

/**
 * The other states that licensed the driver, as chips: each has an x to
 * take it off, and the box after them adds one (Enter or Add). Saving the
 * form updates the qualification file: a hiring driving record per state,
 * and a removed state's record comes off unless one is already on file.
 */
function StatesField({
  defaultValue,
  issuingState,
  errors,
  onUpdate,
}: {
  defaultValue: string[]
  /** The saved CDL state, when the form's Issuing state box is empty. */
  issuingState: string | null
  errors?: { message: string }[]
  onUpdate: (form: HTMLFormElement | null) => void
}) {
  const [states, setStates] = useState<string[]>(defaultValue)
  const [draft, setDraft] = useState("")
  const [problem, setProblem] = useState<string | null>(null)
  const hiddenRef = useRef<HTMLInputElement>(null)
  const firstRender = useRef(true)
  const value = states.join(",")

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    onUpdate(hiddenRef.current?.form ?? null)
    // Only when the value changes; onUpdate is a new function every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function add() {
    const code = draft.trim().toUpperCase()
    if (!code) return
    if (!(US_STATES as readonly string[]).includes(code)) {
      setProblem(`${code} isn't a US state code.`)
      return
    }
    // What's typed in Issuing state now, which may not be saved yet (a new
    // driver, or an edit in progress), else the saved one.
    const issuing =
      (
        hiddenRef.current?.form?.elements.namedItem(
          "cdl_state"
        ) as HTMLInputElement | null
      )?.value
        .trim()
        .toUpperCase() || issuingState
    if (code === issuing) {
      setProblem(`${code} is the issuing state already.`)
      return
    }
    if (states.includes(code)) {
      setProblem(`${code} is on the list already.`)
      return
    }
    if (states.length >= 10) {
      setProblem("List up to 10 states.")
      return
    }
    setStates((current) => [...current, code])
    setDraft("")
    setProblem(null)
  }

  return (
    <fieldset className="grid gap-2 sm:col-span-6">
      <legend className="mb-1 text-sm font-medium">
        Other states, past 3 years
      </legend>
      <input
        ref={hiddenRef}
        type="hidden"
        name="prior_license_states"
        value={value}
      />
      <div className="flex flex-wrap items-center gap-2">
        {states.map((code) => (
          <span
            key={code}
            className="inline-flex h-8 items-center gap-1 rounded-md border bg-muted/40 pr-1 pl-3 text-sm font-semibold"
          >
            {code}
            <button
              type="button"
              aria-label={`Remove ${code}`}
              title={`Remove ${code}`}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive"
              onClick={() =>
                setStates((current) => current.filter((s) => s !== code))
              }
            >
              <X className="size-3.5" />
            </button>
          </span>
        ))}
        <div className="flex items-center gap-1.5">
          <Input
            aria-label="Add a state"
            placeholder="e.g. OK"
            autoCapitalize="characters"
            maxLength={2}
            className="h-8 w-20"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value.replace(/[^a-z]/gi, "").toUpperCase())
              setProblem(null)
            }}
            onKeyDown={(event) => {
              // Enter adds the state instead of saving the form, so it
              // mustn't reach the form's own Enter-to-save handler.
              if (event.key === "Enter") {
                event.preventDefault()
                event.stopPropagation()
                add()
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!draft}
            onClick={add}
          >
            <Plus /> Add
          </Button>
        </div>
      </div>
      <FieldDescription>
        Every other state that licensed them in the past 3 years. A hiring
        driving record is needed from each; removing a state takes its record
        off the qualification file unless one is already on file.
      </FieldDescription>
      {problem ? (
        <FieldError errors={[{ message: problem }]} />
      ) : errors?.length ? (
        <FieldError errors={errors} />
      ) : null}
    </fieldset>
  )
}

/**
 * A photo or PDF of the CDL, saved straight away with the driver's
 * documents (the same copy the Documents card shows). Its file input has
 * no name, so the form's own save leaves it out.
 */
function CdlCopyField({
  organizationId,
  driverId,
  copy,
  kind = "cdl",
  label = "Copy of the CDL",
}: {
  organizationId: string
  driverId: string
  copy: { id: string; file_name: string; url: string | null } | null
  kind?: "cdl" | "medical_card"
  label?: string
}) {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const [sending, setSending] = useState<string | null>(null)

  async function upload(file: File) {
    setSending(file.name)
    const problem = await uploadDriverDocument(organizationId, driverId, {
      kind,
      title: "",
      expires_on: "",
      file,
    })
    setSending(null)
    if (problem) {
      toast.error(problem)
      return
    }
    toast.success(`${label} saved.`)
    router.refresh()
  }

  const [dragging, setDragging] = useState(false)
  // The new name while renaming, or null.
  const [draft, setDraft] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)
  // Enter saves and closes the box, which can also fire a blur: save once.
  const settled = useRef(false)
  const filled = !!copy && !sending

  async function rename() {
    if (!copy || draft === null || settled.current) return
    settled.current = true
    const name = draft.trim()
    setDraft(null)
    if (!name || name === copy.file_name) return
    setRenaming(true)
    const result = await renameDriverDocument(
      organizationId,
      driverId,
      copy.id,
      name
    )
    setRenaming(false)
    if ("error" in result) {
      toast.error(result.error)
      return
    }
    toast.success("Renamed.")
    router.refresh()
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border p-3 transition-colors sm:col-span-6",
        filled ? "bg-card" : "border-dashed",
        dragging && "border-brand bg-brand/5"
      )}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        const file = event.dataTransfer.files?.[0]
        if (file && !sending) void upload(file)
      }}
    >
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-md",
          filled ? "bg-brand/10 text-brand" : "bg-muted text-muted-foreground"
        )}
      >
        {filled ? (
          <FileText className="size-5" />
        ) : (
          <IdCard className="size-5" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{label}</p>
        {sending ? (
          <p className="truncate text-xs text-muted-foreground">
            Uploading {sending}…
          </p>
        ) : copy && draft !== null ? (
          <Input
            aria-label="New name"
            value={draft}
            autoFocus
            maxLength={200}
            className="mt-0.5 h-7 text-xs"
            onFocus={(event) => {
              // Select the name, not the extension, ready to type over.
              const dot = event.currentTarget.value.lastIndexOf(".")
              event.currentTarget.setSelectionRange(
                0,
                dot > 0 ? dot : event.currentTarget.value.length
              )
            }}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Kept from the form, so Enter doesn't save the CDL card.
              event.stopPropagation()
              if (event.key === "Enter") {
                event.preventDefault()
                void rename()
              } else if (event.key === "Escape") {
                event.preventDefault()
                settled.current = true
                setDraft(null)
              }
            }}
            onBlur={() => void rename()}
          />
        ) : copy ? (
          <div className="flex min-w-0 items-center gap-1">
            <a
              href={copy.url ?? undefined}
              target="_blank"
              rel="noreferrer"
              title={`Open ${copy.file_name}`}
              className={cn(
                "truncate text-xs text-brand hover:underline",
                renaming && "opacity-60"
              )}
            >
              {copy.file_name}
            </a>
            <button
              type="button"
              aria-label={`Rename the ${label.toLowerCase()}`}
              title="Rename"
              disabled={renaming}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => {
                settled.current = false
                setDraft(copy.file_name)
              }}
            >
              <Pencil className="size-3" />
            </button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Not uploaded</p>
        )}
      </div>
      <Button
        type="button"
        size="sm"
        variant={filled ? "ghost" : "outline"}
        disabled={!!sending}
        className="shrink-0"
        onClick={() => fileInput.current?.click()}
      >
        <Upload /> {filled ? "Replace" : "Upload"}
      </Button>
      <input
        ref={fileInput}
        type="file"
        accept={FILE_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (file) void upload(file)
        }}
      />
    </div>
  )
}

/** Uppercases as you type, keeping the caret where it was. */
function handleUppercaseInput(event: React.ChangeEvent<HTMLInputElement>) {
  const input = event.currentTarget
  const upper = input.value.toUpperCase()
  if (upper !== input.value) {
    const { selectionStart, selectionEnd } = input
    input.value = upper
    input.setSelectionRange(selectionStart, selectionEnd)
  }
}

/** Letters only, uppercased: "tx" → "TX". */
function handleStateInput(event: React.ChangeEvent<HTMLInputElement>) {
  const input = event.currentTarget
  const cleaned = input.value
    .replace(/[^a-z]/gi, "")
    .toUpperCase()
    .slice(0, 2)
  if (cleaned !== input.value) {
    input.value = cleaned
  }
}

/**
 * The fields for a driver. With `driver` it edits that driver and stays on the
 * page; without, it adds a new one and goes back to the list.
 */
export function DriverForm({
  organizationId,
  base,
  driver,
  cardClassName,
  cdlCopy,
  medicalCopy,
  staleRate,
}: {
  organizationId: string
  /** /org/<slug>/drivers */
  base: string
  driver?: Driver
  /** The newest copy of the CDL on file, shown on the CDL card. */
  cdlCopy?: { id: string; file_name: string; url: string | null } | null
  /** The newest copy of the medical card, shown on the Medical card card. */
  medicalCopy?: { id: string; file_name: string; url: string | null } | null
  /**
   * Classes for each card (pay is only a card when adding a driver). When given, the form adds no box of its own, so
   * its cards sit directly in the page's column and can be ordered among
   * the other cards there.
   */
  cardClassName?: Partial<Record<DriverFormCard, string>>
  /**
   * The driver's current rate and the upcoming loads still locked at an
   * older one, offered a move on the Pay card. Null when there are none.
   */
  staleRate?: {
    currentRate: string
    stale: { reference: string; locked: string }[]
  } | null
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  // The values as loaded (or last saved), to tell which cards have changes.
  const baseline = useRef<Map<string, string> | null>(null)
  // Set by a save, so the baseline is retaken once saving has finished.
  const rebase = useRef(false)
  const [dirtyCards, setDirtyCards] = useState<Set<DriverFormCard>>(new Set())
  // Adding: whether anything has been entered, to ask before leaving.
  const [entered, setEntered] = useState(false)

  // Adding a driver: the CDL and medical card attached beside the form,
  // saved to their documents with the driver.
  const [docFiles, setDocFiles] = useState<DocFiles>({
    cdl: null,
    medical_card: null,
  })
  // Adding a driver: their notes, saved on their own once the driver is
  // added, as the Notes box on the driver page does. No name, so the
  // form's own values leave them out.
  const [notes, setNotes] = useState("")
  const setDocFile = (kind: keyof DocFiles, file: File | null) =>
    setDocFiles((current) => ({ ...current, [kind]: file }))

  const { errors, formError, pending, formProps, revalidate } = useZodForm(
    driverSchema,
    async (values) => {
      if (driver) {
        const result = await updateDriver(organizationId, driver.id, values)
        if ("error" in result) {
          return result.error
        }
        toast.success(`${values.full_name} saved.`)
        // What's saved is the new starting point, so the buttons go quiet.
        // The snapshot waits until saving ends: the form is disabled while
        // saving, and disabled fields are left out of its values.
        rebase.current = true
        setDirtyCards(new Set())
        return
      }

      const result = await createDriver(organizationId, values)
      if ("error" in result) {
        return result.error
      }

      const problems: string[] = []
      if (notes.trim()) {
        const saved = await updateDriverNotes(organizationId, result.id, notes)
        if ("error" in saved) {
          problems.push("notes")
        }
      }

      // The copies attached on the CDL and medical cards go on as the
      // driver's first documents.
      const uploads = (["cdl", "medical_card"] as const).filter(
        (kind) => docFiles[kind]
      )
      const failed: string[] = []
      for (const kind of uploads) {
        const problem = await uploadDriverDocument(organizationId, result.id, {
          kind,
          title: "",
          expires_on: "",
          file: docFiles[kind]!,
        })
        if (problem) {
          failed.push(kind === "cdl" ? "CDL" : "medical card")
        }
      }
      problems.push(...failed)
      if (problems.length) {
        // "notes", "notes and CDL", "notes, CDL and medical card"
        const list =
          problems.length > 1
            ? `${problems.slice(0, -1).join(", ")} and ${problems.at(-1)}`
            : problems[0]
        const plural = problems.length > 1 || problems[0] === "notes"
        toast.warning(
          `${values.full_name} added, but the ${list} didn't save. Add ${plural ? "them" : "it"} here.`
        )
      } else if (uploads.length) {
        toast.success(`${values.full_name} added with their documents.`)
      } else {
        toast.success(`${values.full_name} added. Upload their CDL here.`)
      }
      // Without a CDL on file, land on the CDL card to upload one.
      const cdlSaved = !!docFiles.cdl && !failed.includes("CDL")
      router.push(`${base}/${result.id}${cdlSaved ? "" : `#${DRIVER_CDL_ID}`}`)
    }
  )

  useEffect(() => {
    baseline.current = snapshot(formRef.current)
  }, [])

  // After a save, once the form is enabled again, take the new baseline.
  useEffect(() => {
    if (!pending && rebase.current) {
      rebase.current = false
      baseline.current = snapshot(formRef.current)
    }
  }, [pending])

  /** Which cards have a field that differs from the baseline. */
  function checkDirty(form: HTMLFormElement | null) {
    if (!form || !baseline.current) {
      return
    }
    const now = snapshot(form)
    if (!driver) {
      const start = baseline.current
      setEntered(
        [...new Set([...start.keys(), ...now.keys()])].some(
          (name) => start.get(name) !== now.get(name)
        )
      )
      return
    }
    const dirty = new Set<DriverFormCard>()
    for (const name of new Set([...baseline.current.keys(), ...now.keys()])) {
      if (baseline.current.get(name) !== now.get(name)) {
        const card = cardOf(form, name)
        if (card) {
          dirty.add(card)
        }
      }
    }
    setDirtyCards(dirty)
  }

  /** For fields a custom control fills in, which fire no change events. */
  function onUpdate(form: HTMLFormElement | null) {
    revalidate(form)
    checkDirty(form)
  }

  // When editing, every card gets its own save bar so you don't have to
  // scroll to the bottom. They all submit the same form, so remember which
  // card the save came from and show "Saving…" and errors only there.
  const [savingCard, setSavingCard] = useState<DriverFormCard>("details")

  function markSavingCard(event: React.MouseEvent<HTMLButtonElement>) {
    setSavingCard(cardOf(event.currentTarget) ?? "details")
  }

  // Enter in a field would press the form's first save button, which is
  // disabled unless the first card changed. Save from the field's own card.
  function onKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
    const target = event.target
    if (
      !driver ||
      event.key !== "Enter" ||
      !(target instanceof HTMLInputElement) ||
      ["button", "submit", "checkbox", "radio"].includes(target.type)
    ) {
      return
    }
    event.preventDefault()
    const card = cardOf(target)
    const button = card && saveButton(event.currentTarget, card)
    if (button && !button.disabled) {
      setSavingCard(card)
      event.currentTarget.requestSubmit(button)
    }
  }

  const saveLabel = (card: DriverFormCard) =>
    pending && savingCard === card ? "Saving…" : "Save"

  const cardFooter = (card: DriverFormCard) =>
    driver ? (
      <SettingsCardFooter
        hint={
          savingCard === card &&
          formError && <span className="text-destructive">{formError}</span>
        }
      >
        <Button
          type="submit"
          size="sm"
          disabled={pending || !dirtyCards.has(card)}
          onClick={markSavingCard}
        >
          {saveLabel(card)} <CornerDownLeft />
        </Button>
      </SettingsCardFooter>
    ) : undefined

  // The notes and attached copies sit outside the form's values, so they
  // count too.
  const unsaved =
    entered || !!notes.trim() || !!docFiles.cdl || !!docFiles.medical_card

  return (
    <>
      {!driver && <LeaveGuard when={unsaved && !pending} />}
      <form
        {...formProps}
        ref={formRef}
        autoComplete="off"
        className={cardClassName && "contents"}
        onChange={(event) => {
          formProps.onChange(event)
          checkDirty(event.currentTarget)
        }}
        onKeyDown={onKeyDown}
      >
        <fieldset
          disabled={pending}
          className={
            cardClassName
              ? "contents"
              : driver
                ? "flex flex-col gap-6"
                : // Adding: the cards, with the documents and saving beside
                  // them in view.
                  "grid items-start gap-6 @4xl/main:grid-cols-[minmax(0,1fr)_20rem] @6xl/main:grid-cols-[minmax(0,1fr)_24rem]"
          }
        >
          <div
            className={
              driver
                ? "contents"
                : "flex min-w-0 flex-col gap-6 @4xl/main:col-start-1 @4xl/main:row-start-1"
            }
          >
            <SettingsCard
              title={driver ? "Driver details" : "Driver"}
              description="Name, how to reach them, and when they started."
              id={DRIVER_CARD_IDS.details}
              data-card="details"
              className={cardClassName?.details}
              footer={cardFooter("details")}
              contentClassName="grid gap-5 sm:grid-cols-6"
            >
              <TextField
                name="full_name"
                label="Full name"
                placeholder="e.g. Marcus Hill"
                defaultValue={driver?.full_name}
                errors={errors}
                className="sm:col-span-6"
                autoFocus={!driver}
              />
              <TextField
                name="phone"
                label="Sign-in number"
                type="tel"
                placeholder="(555) 123-4567"
                defaultValue={
                  driver?.phone ? formatPhone(driver.phone) : undefined
                }
                errors={errors}
                className="sm:col-span-3"
                onChange={handlePhoneInput}
                onKeyDown={handlePhoneKeyDown}
              />
              <TextField
                name="email"
                label="Email"
                type="email"
                placeholder="marcus@example.com"
                defaultValue={driver?.email ?? undefined}
                errors={errors}
                className="sm:col-span-3"
              />
              <DateField
                id={fieldId("start_date")}
                name="start_date"
                label="Start date"
                defaultValue={driver?.start_date}
                errors={errors.start_date}
                onUpdate={onUpdate}
                className="sm:col-span-3"
              />
            </SettingsCard>

            <SettingsCard
              // The side panel's CDL links jump here.
              id={DRIVER_CDL_ID}
              className={cn("scroll-mt-6", cardClassName?.cdl)}
              title="CDL"
              description="The license as printed. You'll see a warning 60, 30 and 7 days before it expires."
              data-card="cdl"
              footer={cardFooter("cdl")}
              contentClassName="grid gap-5 sm:grid-cols-6"
            >
              <TextField
                name="cdl_number"
                label="CDL number"
                placeholder="e.g. 12345678"
                defaultValue={driver?.cdl_number ?? undefined}
                errors={errors}
                className="sm:col-span-4"
                onChange={handleUppercaseInput}
              />
              <TextField
                name="cdl_state"
                label="Issuing state"
                placeholder="TX"
                autoCapitalize="characters"
                defaultValue={driver?.cdl_state ?? undefined}
                errors={errors}
                className="sm:col-span-2"
                onChange={handleStateInput}
              />
              <fieldset className="grid gap-2 sm:col-span-6">
                <legend className="mb-1 text-sm font-medium">Class</legend>
                <div className="flex flex-wrap gap-2">
                  {CDL_CLASSES.map((value) => (
                    <label
                      key={value}
                      className="flex cursor-pointer items-center rounded-md border px-3 py-1.5 text-sm has-checked:border-brand has-checked:bg-brand/10 has-checked:text-brand-ink"
                    >
                      <input
                        type="radio"
                        name="cdl_class"
                        value={value}
                        defaultChecked={driver?.cdl_class === value}
                        className="sr-only"
                      />
                      {CDL_CLASS_LABELS[value]}
                    </label>
                  ))}
                </div>
                {errors.cdl_class && <FieldError errors={errors.cdl_class} />}
              </fieldset>
              <EndorsementsField
                defaultValue={driver?.cdl_endorsements ?? []}
                errors={errors.cdl_endorsements}
                onUpdate={onUpdate}
              />
              <TextField
                name="cdl_restrictions"
                label="Restrictions"
                placeholder="e.g. L, Z"
                hint="The letters printed on the license, if any."
                defaultValue={driver?.cdl_restrictions ?? undefined}
                errors={errors}
                className="sm:col-span-3"
                onChange={handleUppercaseInput}
              />
              <DateField
                id={fieldId("cdl_expires_on")}
                name="cdl_expires_on"
                label="CDL expires"
                hint="The expiration date printed on the license."
                defaultValue={driver?.cdl_expires_on}
                errors={errors.cdl_expires_on}
                onUpdate={onUpdate}
                className="sm:col-span-3"
              />
              <StatesField
                defaultValue={driver?.prior_license_states ?? []}
                issuingState={driver?.cdl_state ?? null}
                errors={errors.prior_license_states}
                onUpdate={onUpdate}
              />
              {driver ? (
                <CdlCopyField
                  organizationId={organizationId}
                  driverId={driver.id}
                  copy={cdlCopy ?? null}
                />
              ) : (
                <PendingCopyField
                  kind="cdl"
                  file={docFiles.cdl}
                  onChange={(file) => setDocFile("cdl", file)}
                />
              )}
            </SettingsCard>

            <SettingsCard
              className={cardClassName?.medical}
              title="Medical card"
              description="The DOT medical examiner's certificate. You'll see a warning 60, 30 and 7 days before it expires."
              id={DRIVER_CARD_IDS.medical}
              data-card="medical"
              footer={cardFooter("medical")}
              contentClassName="grid gap-5 sm:grid-cols-6"
            >
              <TextField
                name="medical_examiner_name"
                label="Medical examiner"
                placeholder="e.g. Dr. Jane Lee"
                defaultValue={driver?.medical_examiner_name ?? undefined}
                errors={errors}
                className="sm:col-span-3"
              />
              <TextField
                name="medical_examiner_registry_number"
                label="Examiner's registry number"
                placeholder="e.g. 1234567890"
                inputMode="numeric"
                defaultValue={
                  driver?.medical_examiner_registry_number ?? undefined
                }
                errors={errors}
                className="sm:col-span-3"
              />
              <DateField
                id={fieldId("medical_exam_on")}
                name="medical_exam_on"
                label="Exam date"
                defaultValue={driver?.medical_exam_on}
                errors={errors.medical_exam_on}
                onUpdate={onUpdate}
                className="sm:col-span-3"
              />
              <DateField
                id={fieldId("medical_card_expires_on")}
                name="medical_card_expires_on"
                label="Medical card expires"
                defaultValue={driver?.medical_card_expires_on}
                errors={errors.medical_card_expires_on}
                onUpdate={onUpdate}
                className="sm:col-span-3"
              />
              <label className="flex items-start gap-2 text-sm sm:col-span-6">
                <input
                  type="checkbox"
                  name="holds_medical_variance"
                  defaultChecked={driver?.holds_medical_variance ?? false}
                  className="mt-0.5 size-4 accent-brand"
                />
                <span>
                  Holds a medical variance, SPE certificate or exemption letter
                </span>
              </label>
              {driver ? (
                <CdlCopyField
                  organizationId={organizationId}
                  driverId={driver.id}
                  copy={medicalCopy ?? null}
                  kind="medical_card"
                  label="Copy of the medical card"
                />
              ) : (
                <PendingCopyField
                  kind="medical_card"
                  file={docFiles.medical_card}
                  onChange={(file) => setDocFile("medical_card", file)}
                />
              )}
            </SettingsCard>

            <SettingsCard
              title="Pay"
              description="It works out the driver's cut and your profit on each load."
              id={PAY_CARD_ID}
              className={cn("scroll-mt-6", cardClassName?.pay)}
              data-card="pay"
              contentClassName="grid gap-5 sm:grid-cols-6"
              footer={cardFooter("pay")}
            >
              <PayFields
                defaultType={driver?.pay_type ?? null}
                defaultRate={driver?.pay_rate ?? null}
                defaultPeriod={driver?.pay_period ?? "week"}
                errors={errors}
                onUpdate={onUpdate}
              />
              {driver && staleRate && !dirtyCards.has("pay") && (
                <StaleRateNotice
                  organizationId={organizationId}
                  driverId={driver.id}
                  {...staleRate}
                  className="sm:col-span-6"
                />
              )}
            </SettingsCard>

            {!driver && (
              // On the driver page notes save from their own box beside it.
              <>
                <SettingsCard
                  title="Notes"
                  id={NOTES_CARD_ID}
                  className="scroll-mt-6"
                >
                  <Textarea
                    aria-label="Notes"
                    // Saved on its own once the driver is added, so it has no
                    // name; the panel still counts it.
                    data-panel-field="notes"
                    rows={3}
                    maxLength={2000}
                    placeholder="Endorsements, home terminal, preferred lanes…"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </SettingsCard>
              </>
            )}
          </div>

          {!driver && (
            // Beside the cards, what's filled in and saving stay in view; on a
            // phone they come after them, as on New load.
            <aside className="@4xl/main:sticky @4xl/main:top-6 @4xl/main:col-start-2 @4xl/main:row-start-1">
              <AddRecordPanel
                eyebrow="New driver"
                placeholderTitle="Add a driver"
                nameField="full_name"
                sections={[
                  { id: DRIVER_CARD_IDS.details, label: "Driver" },
                  { id: DRIVER_CDL_ID, label: "CDL" },
                  { id: DRIVER_CARD_IDS.medical, label: "Medical card" },
                  { id: PAY_CARD_ID, label: "Pay" },
                  { id: NOTES_CARD_ID, label: "Notes", optional: true },
                ]}
                hint="Only their name is needed to save. Anything else can be added from their page later."
                submitLabel="Save driver"
                pending={pending}
                cancelHref={base}
                formError={formError}
              />
            </aside>
          )}
        </fieldset>
      </form>
    </>
  )
}
