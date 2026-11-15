"use client"

import { Ban, Loader2, Plus, Search, Wallet } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import {
  addBrokerDomain,
  lookupMc,
  type McLookup,
} from "@/app/org/[slug]/brokers/actions"
import { FlagBadge, FmcsaBadge } from "@/components/brokers/broker-badges"
import { SenderWarning } from "@/components/brokers/sender-warning"
import {
  AddBrokerDialog,
  type NewBrokerDefaults,
} from "@/components/brokers/add-broker-dialog"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  checkSender,
  emailDomain,
  fmcsaFlags,
  formatMc,
  formatTerms,
  isFreeEmailDomain,
} from "@/lib/broker-format"
import type { BrokerOption } from "@/lib/brokers"
import { cleanMc, nameKey } from "@/lib/rate-con-format"

const OTHER = "other"
const NONE = ""

type FieldErrors = { message: string }[] | undefined

/** What booking with this broker means: warnings, terms, where the invoice goes. */
function BrokerSummary({
  broker,
  brokersHref,
  factoringName,
}: {
  broker: BrokerOption
  brokersHref: string
  factoringName: string | null
}) {
  const flags = fmcsaFlags(broker.fmcsa)
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
      {broker.do_not_use && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-destructive"
        >
          <Ban className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-medium">Marked do not use.</span>{" "}
            {broker.do_not_use_reason ?? "No reason given."}
          </span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`${brokersHref}/${broker.id}`}
          className="font-medium hover:underline"
        >
          {broker.legal_name}
        </Link>
        {broker.mc_number && (
          <span className="text-muted-foreground">
            {formatMc(broker.mc_number)}
          </span>
        )}
        {flags.length === 0 && (
          <FmcsaBadge record={broker.fmcsa} hasMc={!!broker.mc_number} />
        )}
      </div>
      {flags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {flags.map((flag) => (
            <FlagBadge key={flag.key} flag={flag} />
          ))}
        </div>
      )}
      <dl className="grid gap-x-6 gap-y-1 text-muted-foreground sm:grid-cols-3">
        <div>
          <dt className="sr-only">Terms</dt>
          <dd>
            {formatTerms(
              broker.payment_terms_days,
              broker.quick_pay_fee_percent
            )}
          </dd>
        </div>
        <div>
          <dt className="sr-only">Invoices</dt>
          <dd>
            {broker.invoice_method === "portal"
              ? "Invoices: their portal, by hand"
              : "Invoices by email"}
          </dd>
        </div>
        <div>
          <dt className="sr-only">Factoring</dt>
          <dd
            className={
              broker.factored && !broker.noa_on_file
                ? "text-amber-700 dark:text-amber-300"
                : undefined
            }
          >
            {broker.factored
              ? `${factoringName ? `Factored through ${factoringName}` : "Factored"}${broker.noa_on_file ? "" : ", no NOA yet"}`
              : "Not factored"}
          </dd>
        </div>
      </dl>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Wallet className="size-3.5" />
        Payment history shows here once invoices are built.
      </p>
    </div>
  )
}

/** What FMCSA says about an MC number that isn't one of your brokers. */
function FmcsaLookupResult({
  mc,
  lookup,
  typedName,
}: {
  mc: string
  lookup: Extract<McLookup, { ok: true }>
  typedName: string
}) {
  const record = lookup.fmcsa
  if (!record) {
    return (
      <p
        role="status"
        className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
      >
        {lookup.fmcsaError ?? `FMCSA has no company with ${formatMc(mc)}.`}
        {lookup.fmcsaNotFound && " Check the MC number on the rate con."}
      </p>
    )
  }
  const flags = fmcsaFlags(record)
  const fmcsaName = record.dba_name ?? record.legal_name
  const nameDiffers =
    !!typedName.trim() &&
    !!fmcsaName &&
    nameKey(typedName) !== nameKey(record.legal_name ?? "") &&
    nameKey(typedName) !== nameKey(record.dba_name ?? "")
  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">
          {record.legal_name ?? "No name on file"}
        </span>
        {record.dba_name && (
          <span className="text-muted-foreground">DBA {record.dba_name}</span>
        )}
        <span className="text-muted-foreground">{formatMc(mc)}</span>
        {flags.length === 0 && <FmcsaBadge record={record} hasMc />}
      </div>
      {flags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {flags.map((flag) => (
            <FlagBadge key={flag.key} flag={flag} />
          ))}
        </div>
      )}
      {nameDiffers && (
        <p className="text-amber-700 dark:text-amber-300">
          FMCSA has this MC as {fmcsaName}, not {typedName.trim()}. Check
          you&apos;ve got the right broker.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        From FMCSA
        {lookup.fmcsaError ? ` (saved copy: ${lookup.fmcsaError})` : ""}
        {record.city && record.state
          ? `, based in ${record.city}, ${record.state}`
          : ""}
        .
      </p>
    </div>
  )
}

/**
 * Adds the rate con sender's domain to the broker's known domains, for a
 * sender the office has confirmed. Free email providers can't be added.
 */
function AddSenderDomain({
  organizationId,
  broker,
  domain,
  mismatch,
}: {
  organizationId: string
  broker: BrokerOption
  domain: string
  /** The broker has other domains, so this one might be someone posing. */
  mismatch: boolean
}) {
  const [pending, setPending] = useState(false)
  const name = broker.dba_name ?? broker.legal_name

  if (isFreeEmailDomain(domain)) {
    return (
      <p className="text-xs opacity-90">
        <span className="font-medium">{domain}</span> is a free email provider,
        so it can&apos;t be saved as {name}&apos;s domain.
      </p>
    )
  }

  async function add() {
    setPending(true)
    const result = await addBrokerDomain(organizationId, broker.id, domain)
    setPending(false)
    if ("error" in result) {
      toast.error(result.error)
      return
    }
    toast.success(`${domain} added to ${name}'s domains.`)
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <p className="min-w-0 text-xs opacity-90">
        {mismatch
          ? `Called ${name} and it's really them? Save the domain so it's trusted next time.`
          : `Is this ${name}'s company email? Save the domain to check senders from now on.`}
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="max-w-full shrink-0 border-current/20 bg-background text-foreground shadow-xs hover:bg-background/80"
        title={`Add ${domain} to ${name}'s known domains`}
        disabled={pending}
        onClick={() => void add()}
      >
        {pending ? <Loader2 className="animate-spin" /> : <Plus />}
        <span className="truncate">
          {pending ? "Saving…" : `Trust ${domain}`}
        </span>
      </Button>
    </div>
  )
}

type Lookup =
  | { state: "idle" }
  | { state: "checking"; mc: string }
  | { state: "error"; message: string }
  | { state: "done"; mc: string; result: Extract<McLookup, { ok: true }> }

/**
 * The broker on a new load: one of your brokers, or a name typed in for a
 * broker you haven't added yet. Fills `broker_id` and `broker_name`, and
 * checks the rate con sender (`rate_con_from`) against the broker's domains.
 *
 * The MC number picks the broker: one of yours with that MC is chosen even
 * when the name is spelled differently, and any other MC is checked with
 * FMCSA. It isn't saved on the load.
 */
export function BrokerFields({
  organizationId,
  brokers,
  brokersHref,
  factoringName,
  defaults,
  errors,
  onUpdate,
}: {
  organizationId: string
  brokers: BrokerOption[]
  /** /org/<slug>/brokers */
  brokersHref: string
  /** Your factoring company, for factored brokers. */
  factoringName: string | null
  /** What an existing load already has, or what AI read off the rate con. */
  defaults?: {
    brokerId: string | null
    brokerName: string
    sender: string | null
    /** The MC number, digits only. */
    mc?: string | null
  }
  errors: {
    broker_id?: FieldErrors
    broker_name?: FieldErrors
    rate_con_from?: FieldErrors
  }
  onUpdate: (form: HTMLFormElement | null) => void
}) {
  // With no brokers yet, start on "type a name" so the field isn't empty.
  const [choice, setChoice] = useState(() => {
    if (defaults?.brokerId && brokers.some((b) => b.id === defaults.brokerId)) {
      return defaults.brokerId
    }
    // A load booked with only a typed name keeps it, ready to swap for a broker.
    if (defaults?.brokerName || defaults?.mc) return OTHER
    return brokers.length ? NONE : OTHER
  })
  const [typedName, setTypedName] = useState(
    defaults?.brokerId ? "" : (defaults?.brokerName ?? "")
  )
  const [mc, setMc] = useState(() => {
    const saved = brokers.find((b) => b.id === defaults?.brokerId)
    return (
      (saved?.mc_number ? cleanMc(saved.mc_number) : null) ?? defaults?.mc ?? ""
    )
  })
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" })
  // Says so when an MC number picked one of your brokers.
  const [matchedByMc, setMatchedByMc] = useState(false)
  const lookupId = useRef(0)
  const [sender, setSender] = useState(defaults?.sender ?? "")
  const [adding, setAdding] = useState(false)
  const hiddenRef = useRef<HTMLInputElement>(null)
  const firstRender = useRef(true)

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    onUpdate(hiddenRef.current?.form ?? null)
    // Only when the choice changes; onUpdate is a new function every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choice])

  const broker = brokers.find((b) => b.id === choice) ?? null

  /** Picks the broker with this MC, or checks it with FMCSA. */
  async function checkMc(raw: string) {
    const id = ++lookupId.current
    const cleaned = cleanMc(raw)
    if (!raw.trim()) {
      setLookup({ state: "idle" })
      return
    }
    if (!cleaned) {
      setLookup({
        state: "error",
        message: "Enter an MC number of up to 8 digits.",
      })
      return
    }
    setMc(cleaned)
    const saved = brokers.find(
      (b) => b.mc_number && cleanMc(b.mc_number) === cleaned
    )
    if (saved) {
      setChoice(saved.id)
      setMatchedByMc(true)
      setLookup({ state: "idle" })
      return
    }
    setMatchedByMc(false)
    // A different MC than the chosen broker's means a different broker.
    if (choice !== OTHER) setChoice(OTHER)
    setLookup({ state: "checking", mc: cleaned })
    let result: McLookup
    try {
      result = await lookupMc(organizationId, cleaned)
    } catch {
      result = { error: "Couldn't reach FMCSA. Try again." }
    }
    if (id !== lookupId.current) return
    if ("error" in result) {
      setLookup({ state: "error", message: result.error })
      return
    }
    if (result.existing) {
      setChoice(result.existing.id)
      setMatchedByMc(true)
      setLookup({ state: "idle" })
      return
    }
    setLookup({ state: "done", mc: cleaned, result })
    const fmcsaName = result.fmcsa?.dba_name ?? result.fmcsa?.legal_name
    if (fmcsaName) setTypedName((name) => (name.trim() ? name : fmcsaName))
  }

  // An MC number AI read off the rate con, for a broker not in your list,
  // is checked with FMCSA straight away.
  useEffect(() => {
    const startMc = defaults?.brokerId ? null : defaults?.mc
    if (!startMc) return
    // Started after the first render, like a person pressing Check.
    const timer = setTimeout(() => void checkMc(startMc), 0)
    return () => clearTimeout(timer)
    // Once, for the starting values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const items = [
    { value: NONE, label: "Choose a broker" },
    ...brokers.map((b) => ({
      value: b.id,
      label: `${b.dba_name ?? b.legal_name}${b.do_not_use ? " (do not use)" : ""}`,
    })),
    { value: OTHER, label: "Not in your list: type the name" },
  ]
  const nameErrors = errors.broker_name ?? errors.broker_id
  const fmcsa = lookup.state === "done" ? lookup.result.fmcsa : null
  const senderDomain = sender ? emailDomain(sender) : null
  const newBrokerDefaults: NewBrokerDefaults = {
    legal_name: fmcsa?.legal_name ?? (typedName.trim() || null),
    // A short name typed on the load ("TQL") is kept as the DBA when FMCSA
    // has the full legal name.
    dba_name:
      fmcsa?.dba_name ??
      (fmcsa?.legal_name &&
      typedName.trim() &&
      nameKey(typedName) !== nameKey(fmcsa.legal_name)
        ? typedName.trim()
        : null),
    mc_number: cleanMc(mc),
    dot_number: fmcsa?.dot_number,
    phone: fmcsa?.phone,
    address_line1: fmcsa?.street,
    city: fmcsa?.city,
    state: fmcsa?.state,
    postal_code: fmcsa?.postal_code?.slice(0, 5),
    email_domains:
      senderDomain && !isFreeEmailDomain(senderDomain) ? [senderDomain] : [],
  }
  const senderCheck = broker ? checkSender(sender, broker.email_domains) : null
  const checkedMc =
    lookup.state === "done" || lookup.state === "checking" ? lookup.mc : null

  return (
    <>
      <input
        ref={hiddenRef}
        type="hidden"
        name="broker_id"
        value={broker?.id ?? ""}
      />
      {broker && (
        <input
          type="hidden"
          name="broker_name"
          value={broker.dba_name ?? broker.legal_name}
        />
      )}
      <Field data-invalid={!!nameErrors} className="sm:col-span-3">
        <FieldLabel htmlFor="load-broker-id">Broker</FieldLabel>
        {brokers.length > 0 && (
          <Select
            value={choice}
            onValueChange={(value) => {
              const next = (value as string) ?? NONE
              const picked = brokers.find((b) => b.id === next)
              lookupId.current++
              setChoice(next)
              setMatchedByMc(false)
              setLookup({ state: "idle" })
              setMc(picked?.mc_number ? (cleanMc(picked.mc_number) ?? "") : "")
            }}
            items={items}
          >
            <SelectTrigger
              id="load-broker-id"
              aria-invalid={!!nameErrors}
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem key={item.value || "none"} value={item.value}>
                  {item.value === NONE || item.value === OTHER ? (
                    <span className="text-muted-foreground">{item.label}</span>
                  ) : (
                    item.label
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {choice === OTHER && (
          <Input
            id={brokers.length ? "load-broker-name" : "load-broker-id"}
            name="broker_name"
            value={typedName}
            onChange={(event) => setTypedName(event.target.value)}
            placeholder="e.g. TQL"
            aria-label={brokers.length ? "Broker name" : undefined}
            aria-invalid={!!nameErrors}
          />
        )}
        <FieldError errors={nameErrors} />
      </Field>
      <Field data-invalid={lookup.state === "error"} className="sm:col-span-3">
        <FieldLabel htmlFor="load-broker-mc">MC number</FieldLabel>
        <div className="flex gap-1.5">
          <Input
            id="load-broker-mc"
            inputMode="numeric"
            autoComplete="off"
            placeholder="e.g. 411443"
            value={mc}
            aria-invalid={lookup.state === "error"}
            onChange={(event) => {
              setMc(event.target.value)
              if (lookup.state === "error") setLookup({ state: "idle" })
            }}
            onBlur={() => {
              const cleaned = cleanMc(mc)
              const current = broker?.mc_number
                ? cleanMc(broker.mc_number)
                : checkedMc
              if (cleaned !== current) void checkMc(mc)
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                // Checks the MC instead of saving the load.
                event.preventDefault()
                void checkMc(mc)
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Check the MC number with FMCSA"
            title="Check with FMCSA"
            disabled={lookup.state === "checking" || !mc.trim()}
            onClick={() => void checkMc(mc)}
          >
            {lookup.state === "checking" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Search />
            )}
          </Button>
        </div>
        {lookup.state === "error" && (
          <FieldError errors={[{ message: lookup.message }]} />
        )}
      </Field>
      <Field data-invalid={!!errors.rate_con_from} className="sm:col-span-6">
        <FieldLabel htmlFor="load-rate-con-from">Rate con from</FieldLabel>
        <Input
          id="load-rate-con-from"
          name="rate_con_from"
          type="email"
          placeholder="the sender's email address"
          value={sender}
          aria-invalid={!!errors.rate_con_from}
          onChange={(event) => setSender(event.target.value.toLowerCase())}
        />
        <FieldError errors={errors.rate_con_from} />
      </Field>
      {(broker ||
        lookup.state === "checking" ||
        lookup.state === "done" ||
        (choice === OTHER && (typedName.trim() || cleanMc(mc))) ||
        (sender && choice !== OTHER)) && (
        <div className="flex flex-col gap-3 sm:col-span-6">
          {broker && matchedByMc && (
            <p role="status" className="text-sm text-muted-foreground">
              {formatMc(cleanMc(broker.mc_number))} is{" "}
              <span className="font-medium text-foreground">
                {broker.dba_name ?? broker.legal_name}
              </span>{" "}
              in your brokers, so it&apos;s picked by its MC number.
            </p>
          )}
          {broker && senderCheck && sender && (
            <SenderWarning
              check={senderCheck}
              brokerName={broker.dba_name ?? broker.legal_name}
              phone={broker.phone}
            >
              {(senderCheck.state === "mismatch" ||
                senderCheck.state === "unknown") && (
                <AddSenderDomain
                  key={senderCheck.domain}
                  organizationId={organizationId}
                  broker={broker}
                  domain={senderCheck.domain}
                  mismatch={senderCheck.state === "mismatch"}
                />
              )}
            </SenderWarning>
          )}
          {broker && (
            <BrokerSummary
              broker={broker}
              brokersHref={brokersHref}
              factoringName={factoringName}
            />
          )}
          {!broker && lookup.state === "checking" && (
            <p
              role="status"
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" />
              Checking {formatMc(lookup.mc)} with FMCSA…
            </p>
          )}
          {!broker && lookup.state === "done" && (
            <FmcsaLookupResult
              mc={lookup.mc}
              lookup={lookup.result}
              typedName={typedName}
            />
          )}
          {choice === OTHER && (typedName.trim() || cleanMc(mc)) && (
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-dashed px-4 py-3">
              <p className="min-w-0 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {typedName.trim() || formatMc(cleanMc(mc))}
                </span>{" "}
                isn&apos;t in your brokers. Add them to save their terms and
                where invoices go.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => setAdding(true)}
              >
                <Plus />
                Add to my brokers
              </Button>
            </div>
          )}
        </div>
      )}
      <AddBrokerDialog
        open={adding}
        onOpenChange={setAdding}
        organizationId={organizationId}
        defaults={newBrokerDefaults}
        onAdded={(added) => {
          // Picked on this load straight away; the list refreshes with it.
          lookupId.current++
          setLookup({ state: "idle" })
          setMatchedByMc(false)
          setChoice(added.id)
        }}
      />
    </>
  )
}
