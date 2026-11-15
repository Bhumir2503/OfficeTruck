"use client"

import { Check, Loader2, Pencil, X } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { setInvoiceNumber } from "@/app/org/[slug]/invoices/actions"
import { invoiceNumberSchema } from "@/lib/schemas/invoice"

/**
 * The invoice number on a draft, with a pencil to type over it. Later
 * invoices carry on from the new number.
 */
export function InvoiceNumberField({
  organizationId,
  invoiceId,
  number,
}: {
  organizationId: string
  invoiceId: string
  number: number
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(number))
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function cancel() {
    setEditing(false)
    setValue(String(number))
    setError(null)
  }

  async function save() {
    const parsed = invoiceNumberSchema.safeParse({ number: value })
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }
    if (parsed.data.number === number) {
      cancel()
      return
    }
    setPending(true)
    const result = await setInvoiceNumber(organizationId, invoiceId, {
      number: parsed.data.number,
    })
    setPending(false)
    if ("error" in result) {
      setError(result.error)
      return
    }
    setEditing(false)
    setError(null)
    toast.success(
      `Now invoice ${parsed.data.number}. The next one will follow on from it.`
    )
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="group inline-flex items-center gap-1.5 rounded font-semibold tabular-nums outline-none hover:text-[#007a55] focus-visible:ring-2 focus-visible:ring-[#007a55]/40"
        aria-label={`Invoice number ${number}. Change it`}
        title="Change the invoice number"
      >
        {number}
        <Pencil className="size-3 text-neutral-400 group-hover:text-[#007a55]" />
      </button>
    )
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="inline-flex items-center gap-1">
        <input
          autoFocus
          // Selected, so typing replaces the number instead of adding to it.
          onFocus={(event) => event.currentTarget.select()}
          inputMode="numeric"
          aria-label="Invoice number"
          aria-invalid={!!error}
          value={value}
          disabled={pending}
          onChange={(event) => {
            setValue(event.target.value)
            setError(null)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              void save()
            } else if (event.key === "Escape") {
              cancel()
            }
          }}
          className="h-7 w-24 rounded-md border border-neutral-300 bg-white px-2 text-right text-sm font-semibold tabular-nums outline-none focus:border-[#007a55] focus:ring-2 focus:ring-[#007a55]/20 aria-invalid:border-red-500"
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={pending}
          aria-label="Save invoice number"
          className="inline-flex size-7 items-center justify-center rounded-md text-[#007a55] hover:bg-neutral-100"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={pending}
          aria-label="Cancel"
          className="inline-flex size-7 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100"
        >
          <X className="size-4" />
        </button>
      </span>
      {error && (
        <span role="alert" className="max-w-56 text-xs text-red-600">
          {error}
        </span>
      )}
    </span>
  )
}
