"use client"

import { Ban, Wallet } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"

import { FlagBadge, FmcsaBadge } from "@/components/brokers/broker-badges"
import { SenderWarning } from "@/components/brokers/sender-warning"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
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
  fmcsaFlags,
  formatMc,
  formatTerms,
} from "@/lib/broker-format"
import type { BrokerOption } from "@/lib/brokers"

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

/**
 * The broker on a new load: one of your brokers, or a name typed in for a
 * broker you haven't added yet. Fills `broker_id` and `broker_name`, and
 * checks the rate con sender (`rate_con_from`) against the broker's domains.
 */
export function BrokerFields({
  brokers,
  brokersHref,
  factoringName,
  defaults,
  errors,
  onUpdate,
}: {
  brokers: BrokerOption[]
  /** /org/<slug>/brokers */
  brokersHref: string
  /** Your factoring company, for factored brokers. */
  factoringName: string | null
  /** What an existing load already has, when changing its broker. */
  defaults?: {
    brokerId: string | null
    brokerName: string
    sender: string | null
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
    if (defaults?.brokerName) return OTHER
    return brokers.length ? NONE : OTHER
  })
  const [sender, setSender] = useState(defaults?.sender ?? "")
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
  const items = [
    { value: NONE, label: "Choose a broker" },
    ...brokers.map((b) => ({
      value: b.id,
      label: `${b.dba_name ?? b.legal_name}${b.do_not_use ? " (do not use)" : ""}`,
    })),
    { value: OTHER, label: "Not in your list: type the name" },
  ]
  const nameErrors = errors.broker_name ?? errors.broker_id

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
            onValueChange={(value) => setChoice((value as string) ?? NONE)}
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
            defaultValue={defaults?.brokerId ? undefined : defaults?.brokerName}
            placeholder="e.g. TQL"
            aria-label={brokers.length ? "Broker name" : undefined}
            aria-invalid={!!nameErrors}
            autoFocus={brokers.length > 0 && !defaults}
          />
        )}
        {nameErrors ? (
          <FieldError errors={nameErrors} />
        ) : (
          <FieldDescription>
            {choice === OTHER ? (
              <>
                <Link href={`${brokersHref}/new`} className="underline">
                  Add the broker
                </Link>{" "}
                to check them with FMCSA and keep their billing details.
              </>
            ) : (
              "Their FMCSA status and terms show below."
            )}
          </FieldDescription>
        )}
      </Field>
      <Field data-invalid={!!errors.rate_con_from} className="sm:col-span-3">
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
        {errors.rate_con_from ? (
          <FieldError errors={errors.rate_con_from} />
        ) : (
          <FieldDescription>
            Checked against the broker&apos;s known email domains.
          </FieldDescription>
        )}
      </Field>
      {(broker || (sender && choice !== OTHER)) && (
        <div className="flex flex-col gap-3 sm:col-span-6">
          {broker && sender && (
            <SenderWarning
              check={checkSender(sender, broker.email_domains)}
              brokerName={broker.dba_name ?? broker.legal_name}
              phone={broker.phone}
            />
          )}
          {broker && (
            <BrokerSummary
              broker={broker}
              brokersHref={brokersHref}
              factoringName={factoringName}
            />
          )}
        </div>
      )}
    </>
  )
}
