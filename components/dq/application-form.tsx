"use client"

import { Lock, PenLine, Plus, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { dqFetch } from "@/components/dq/dq-api"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { ApplicationAnswers } from "@/lib/schemas/dq"

/*
 * The employment application (49 CFR 391.21), filled in and signed on the
 * driver's phone. The SSN and date of birth are sent once and encrypted on
 * the server; they're never shown again, only the SSN's last 4 digits.
 */

type Kind = "text" | "date" | "number" | "state" | "zip" | "yesno"
type FieldDef = {
  key: string
  label: string
  kind?: Kind
  optional?: boolean
  wide?: boolean
}
type Row = Record<string, string | number | boolean | null>

const LISTS: {
  key:
    | "addresses"
    | "licenses"
    | "experience"
    | "accidents"
    | "convictions"
    | "employers"
  title: string
  hint: string
  min: number
  noun: string
  fields: FieldDef[]
}[] = [
  {
    key: "addresses",
    title: "Where you've lived",
    hint: "Every address for the past 3 years, newest first.",
    min: 1,
    noun: "address",
    fields: [
      { key: "street", label: "Street", wide: true },
      { key: "city", label: "City" },
      { key: "state", label: "State", kind: "state" },
      { key: "postal_code", label: "ZIP", kind: "zip" },
      { key: "from", label: "From", kind: "date" },
      {
        key: "to",
        label: "To (blank if current)",
        kind: "date",
        optional: true,
      },
    ],
  },
  {
    key: "licenses",
    title: "Driver's licenses",
    hint: "Each license you've held in the past 3 years.",
    min: 1,
    noun: "license",
    fields: [
      { key: "state", label: "State", kind: "state" },
      { key: "number", label: "License number" },
      { key: "class", label: "Class" },
      { key: "endorsements", label: "Endorsements", optional: true },
      { key: "expires_on", label: "Expires", kind: "date" },
    ],
  },
  {
    key: "experience",
    title: "Driving experience",
    hint: "The kinds of equipment you've driven.",
    min: 0,
    noun: "equipment",
    fields: [
      {
        key: "equipment",
        label: "Equipment (e.g. tractor-trailer)",
        wide: true,
      },
      { key: "from", label: "From", kind: "date" },
      {
        key: "to",
        label: "To (blank if current)",
        kind: "date",
        optional: true,
      },
      {
        key: "approximate_miles",
        label: "About how many miles",
        kind: "number",
        optional: true,
      },
    ],
  },
  {
    key: "accidents",
    title: "Accidents, past 3 years",
    hint: "Leave empty if none.",
    min: 0,
    noun: "accident",
    fields: [
      { key: "date", label: "Date", kind: "date" },
      { key: "nature", label: "What happened", wide: true },
      { key: "fatalities", label: "Fatalities", kind: "number" },
      { key: "injuries", label: "Injuries", kind: "number" },
    ],
  },
  {
    key: "convictions",
    title: "Traffic convictions, past 3 years",
    hint: "Not parking tickets. Leave empty if none.",
    min: 0,
    noun: "conviction",
    fields: [
      { key: "date", label: "Date", kind: "date" },
      { key: "location", label: "Where" },
      { key: "charge", label: "Charge" },
      { key: "penalty", label: "Penalty" },
    ],
  },
  {
    key: "employers",
    title: "Employers",
    hint: "Every employer for the past 3 years, and any driving job in the past 10.",
    min: 0,
    noun: "employer",
    fields: [
      { key: "name", label: "Employer", wide: true },
      { key: "address", label: "Address", wide: true },
      { key: "phone", label: "Phone", optional: true },
      { key: "position", label: "Your job" },
      { key: "from", label: "From", kind: "date" },
      {
        key: "to",
        label: "To (blank if current)",
        kind: "date",
        optional: true,
      },
      { key: "reason_for_leaving", label: "Why you left", wide: true },
      {
        key: "subject_to_fmcsrs",
        label: "Subject to the FMCSRs?",
        kind: "yesno",
      },
      {
        key: "safety_sensitive_testing",
        label: "Drug and alcohol tested (safety-sensitive)?",
        kind: "yesno",
      },
    ],
  },
]

const blankRow = (fields: FieldDef[]): Row =>
  Object.fromEntries(
    fields.map((f) => [
      f.key,
      f.kind === "yesno"
        ? false
        : f.kind === "number"
          ? f.optional
            ? null
            : 0
          : "",
    ])
  )

/** Empty optional text goes as null, as the schema expects. */
function cleanRow(fields: FieldDef[], row: Row): Row {
  return Object.fromEntries(
    fields.map((f) => {
      const value = row[f.key]
      if (f.optional && (value === "" || value === undefined))
        return [f.key, null]
      return [f.key, value ?? null]
    })
  )
}

export type SavedApplication = {
  answers: ApplicationAnswers | null
  ssn_last4: string | null
  has_date_of_birth: boolean
  signed: { signer_name: string; signed_at: string; url: string | null } | null
}

export function ApplicationForm({
  itemId,
  driverName,
  saved,
}: {
  itemId: string
  driverName: string
  saved: SavedApplication
}) {
  const router = useRouter()
  const start = saved.answers
  const [person, setPerson] = useState({
    full_name: start?.full_name ?? driverName,
    phone: start?.phone ?? "",
    license_denied_or_suspended: start?.license_denied_or_suspended ?? false,
    license_denial_explanation: start?.license_denial_explanation ?? "",
    employment_gaps: start?.employment_gaps ?? "",
  })
  const [lists, setLists] = useState<Record<string, Row[]>>(() =>
    Object.fromEntries(
      LISTS.map((list) => {
        const rows = (start?.[list.key] ?? []) as unknown as Row[]
        return [
          list.key,
          rows.length ? rows : list.min ? [blankRow(list.fields)] : [],
        ]
      })
    )
  )
  const [ssn, setSsn] = useState("")
  const [dob, setDob] = useState("")
  const [last4, setLast4] = useState(saved.ssn_last4)
  const [hasDob, setHasDob] = useState(saved.has_date_of_birth)
  const [signer, setSigner] = useState(driverName)
  const [agree, setAgree] = useState(false)
  const [pending, setPending] = useState<"save" | "sign" | null>(null)

  if (saved.signed) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border bg-background p-5">
        <p className="inline-flex items-center gap-2 font-medium text-brand-ink">
          <Lock className="size-4" /> Signed by {saved.signed.signer_name}
        </p>
        <p className="text-sm text-muted-foreground">
          Your carrier will review it. A signed application can&apos;t be
          changed.
        </p>
        {saved.signed.url && (
          <a
            href={saved.signed.url}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-brand hover:underline"
          >
            Open the signed PDF
          </a>
        )}
      </div>
    )
  }

  function update(
    listKey: string,
    index: number,
    key: string,
    value: Row[string]
  ) {
    setLists((current) => ({
      ...current,
      [listKey]: current[listKey]!.map((row, i) =>
        i === index ? { ...row, [key]: value } : row
      ),
    }))
  }

  async function save(): Promise<boolean> {
    setPending("save")
    const answers = {
      ...person,
      phone: person.phone || null,
      license_denial_explanation: person.license_denial_explanation || null,
      employment_gaps: person.employment_gaps || null,
      ...Object.fromEntries(
        LISTS.map((list) => [
          list.key,
          lists[list.key]!.map((row) => cleanRow(list.fields, row)),
        ])
      ),
    }
    const result = await dqFetch<{ ssn_last4: string | null }>(
      `items/${itemId}/application`,
      {
        method: "PUT",
        json: { answers, ssn: ssn || null, date_of_birth: dob || null },
      }
    )
    setPending(null)
    if (!result.ok) {
      toast.error(result.error)
      return false
    }
    // The SSN never stays in the page once it's saved.
    setSsn("")
    setLast4(result.data.ssn_last4)
    if (dob) setHasDob(true)
    setDob("")
    toast.success("Saved.")
    return true
  }

  async function sign() {
    if (!(await save())) return
    setPending("sign")
    const result = await dqFetch(`items/${itemId}/sign`, {
      json: { signer_name: signer, agree },
    })
    setPending(null)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("Signed and sent to your carrier.")
    router.replace("/driver")
    router.refresh()
  }

  const section =
    "flex flex-col gap-4 rounded-xl border bg-background p-4 shadow-xs"

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <section className={section}>
        <h2 className="font-display font-semibold">About you</h2>
        <Field>
          <FieldLabel htmlFor="app-name">Full legal name</FieldLabel>
          <Input
            id="app-name"
            required
            value={person.full_name}
            onChange={(e) =>
              setPerson({ ...person, full_name: e.target.value })
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="app-phone">Phone</FieldLabel>
          <Input
            id="app-phone"
            type="tel"
            value={person.phone}
            onChange={(e) => setPerson({ ...person, phone: e.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="app-ssn">Social Security number</FieldLabel>
          <Input
            id="app-ssn"
            inputMode="numeric"
            autoComplete="off"
            placeholder={last4 ? `On file, ending ${last4}` : "123-45-6789"}
            value={ssn}
            onChange={(e) => setSsn(e.target.value)}
          />
          <FieldDescription>
            Encrypted when saved. Only the last 4 digits are ever shown.
            {last4 && " Leave blank to keep the one on file."}
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="app-dob">Date of birth</FieldLabel>
          <Input
            id="app-dob"
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
          />
          <FieldDescription>
            {hasDob
              ? "On file, encrypted. Leave blank to keep it."
              : "Encrypted when saved."}
          </FieldDescription>
        </Field>
      </section>

      {LISTS.map((list) => (
        <section key={list.key} className={section}>
          <div className="space-y-1">
            <h2 className="font-display font-semibold">{list.title}</h2>
            <p className="text-sm text-muted-foreground">{list.hint}</p>
          </div>
          {lists[list.key]!.map((row, index) => (
            <div
              key={index}
              className="grid grid-cols-2 gap-3 rounded-lg border border-dashed p-3"
            >
              {list.fields.map((field) => {
                const id = `${list.key}-${index}-${field.key}`
                const value = row[field.key]
                if (field.kind === "yesno") {
                  return (
                    <label
                      key={field.key}
                      className="col-span-2 flex items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={value === true}
                        onCheckedChange={(v) =>
                          update(list.key, index, field.key, v === true)
                        }
                      />
                      {field.label}
                    </label>
                  )
                }
                return (
                  <Field
                    key={field.key}
                    className={field.wide ? "col-span-2" : undefined}
                  >
                    <FieldLabel htmlFor={id}>{field.label}</FieldLabel>
                    <Input
                      id={id}
                      required={!field.optional}
                      type={
                        field.kind === "date"
                          ? "date"
                          : field.kind === "number"
                            ? "number"
                            : "text"
                      }
                      inputMode={
                        field.kind === "zip" || field.kind === "number"
                          ? "numeric"
                          : undefined
                      }
                      maxLength={field.kind === "state" ? 2 : undefined}
                      min={field.kind === "number" ? 0 : undefined}
                      className={
                        field.kind === "state" ? "uppercase" : undefined
                      }
                      value={
                        value === null || value === undefined
                          ? ""
                          : String(value)
                      }
                      onChange={(e) =>
                        update(
                          list.key,
                          index,
                          field.key,
                          field.kind === "number"
                            ? e.target.value === ""
                              ? field.optional
                                ? null
                                : 0
                              : Number(e.target.value)
                            : e.target.value
                        )
                      }
                    />
                  </Field>
                )
              })}
              {lists[list.key]!.length > list.min && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="col-span-2 w-fit text-muted-foreground"
                  onClick={() =>
                    setLists((current) => ({
                      ...current,
                      [list.key]: current[list.key]!.filter(
                        (_, i) => i !== index
                      ),
                    }))
                  }
                >
                  <Trash2 /> Remove
                </Button>
              )}
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setLists((current) => ({
                ...current,
                [list.key]: [...current[list.key]!, blankRow(list.fields)],
              }))
            }
          >
            <Plus /> Add {list.noun}
          </Button>
        </section>
      ))}

      <section className={section}>
        <h2 className="font-display font-semibold">A few more questions</h2>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={person.license_denied_or_suspended}
            onCheckedChange={(v) =>
              setPerson({ ...person, license_denied_or_suspended: v === true })
            }
            className="mt-0.5"
          />
          Have you ever been denied a license, or had one suspended or revoked?
        </label>
        {person.license_denied_or_suspended && (
          <Field>
            <FieldLabel htmlFor="app-denial">Explain</FieldLabel>
            <Textarea
              id="app-denial"
              value={person.license_denial_explanation}
              onChange={(e) =>
                setPerson({
                  ...person,
                  license_denial_explanation: e.target.value,
                })
              }
            />
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="app-gaps">Gaps in work, past 3 years</FieldLabel>
          <Textarea
            id="app-gaps"
            placeholder="Leave blank if none"
            value={person.employment_gaps}
            onChange={(e) =>
              setPerson({ ...person, employment_gaps: e.target.value })
            }
          />
        </Field>
      </section>

      <Button
        type="submit"
        variant="outline"
        size="lg"
        className="h-11"
        disabled={pending !== null}
      >
        {pending === "save" ? "Saving…" : "Save and finish later"}
      </Button>

      <section className={`${section} border-brand`}>
        <h2 className="font-display font-semibold">Sign</h2>
        <p className="text-sm">
          This certifies that this application was completed by me, and that all
          entries on it and information in it are true and complete to the best
          of my knowledge.
        </p>
        <Field>
          <FieldLabel htmlFor="app-signer">Type your full name</FieldLabel>
          <Input
            id="app-signer"
            value={signer}
            onChange={(e) => setSigner(e.target.value)}
          />
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={agree}
            onCheckedChange={(v) => setAgree(v === true)}
            className="mt-0.5"
          />
          I&apos;m signing this electronically.
        </label>
        <Button
          type="button"
          size="lg"
          className="h-11"
          disabled={pending !== null || !agree || !signer.trim()}
          onClick={() => void sign()}
        >
          <PenLine /> {pending === "sign" ? "Signing…" : "Sign and send"}
        </Button>
      </section>
    </form>
  )
}
