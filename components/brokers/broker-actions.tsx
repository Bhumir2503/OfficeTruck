"use client"

import { Ban, Pencil, RefreshCw, Trash2, UserPlus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import {
  addContact,
  removeContact,
  runFmcsaCheck,
  setDoNotUse,
  updateContact,
} from "@/app/org/[slug]/brokers/actions"
import {
  SettingsCard,
  SettingsEmptyState,
} from "@/components/settings/settings-card"
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
import { Textarea } from "@/components/ui/textarea"
import type { BrokerContact } from "@/lib/brokers"
import { formatPhone, handlePhoneInput, handlePhoneKeyDown } from "@/lib/phone"
import {
  CONTACT_ROLES,
  CONTACT_ROLE_LABELS,
  contactSchema,
  type ContactRole,
} from "@/lib/schemas/broker"

/** Runs the FMCSA check again, whenever it last ran. */
export function RecheckButton({
  organizationId,
  brokerId,
  disabled,
}: {
  organizationId: string
  brokerId: string
  disabled?: boolean
}) {
  const [pending, setPending] = useState(false)
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending || disabled}
      onClick={async () => {
        setPending(true)
        const result = await runFmcsaCheck(organizationId, brokerId)
        setPending(false)
        if ("error" in result) {
          toast.error(result.error)
        } else {
          toast.success("Checked with FMCSA.")
        }
      }}
    >
      <RefreshCw className={pending ? "animate-spin" : undefined} />
      {pending ? "Checking…" : "Check again"}
    </Button>
  )
}

/** Marks a broker "do not use" with a reason, or clears it. */
export function DoNotUseControl({
  organizationId,
  broker,
}: {
  organizationId: string
  broker: {
    id: string
    legal_name: string
    do_not_use: boolean
    do_not_use_reason: string | null
  }
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [pending, setPending] = useState(false)

  async function save(doNotUse: boolean) {
    setPending(true)
    const result = await setDoNotUse(organizationId, broker.id, {
      do_not_use: doNotUse,
      do_not_use_reason: doNotUse ? reason : null,
    })
    setPending(false)
    if ("error" in result) {
      toast.error(result.error)
      return
    }
    setOpen(false)
    setReason("")
    toast.success(
      doNotUse
        ? `${broker.legal_name} marked do not use.`
        : `${broker.legal_name} can be used again.`
    )
  }

  if (broker.do_not_use) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => save(false)}
      >
        {pending ? "Saving…" : "Allow again"}
      </Button>
    )
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Ban />
        Mark do not use
      </Button>
    )
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:w-96">
      <Textarea
        aria-label="Why not to use this broker"
        rows={2}
        autoFocus
        placeholder="Why? e.g. paid 90 days late twice"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
        <Button
          variant="destructive"
          size="sm"
          disabled={pending}
          onClick={() => save(true)}
        >
          {pending ? "Saving…" : "Mark do not use"}
        </Button>
      </div>
    </div>
  )
}

/** One contact, shown as text, or as fields while it's being edited. */
function ContactRow({
  organizationId,
  contact,
  removing,
  onRemove,
}: {
  organizationId: string
  contact: BrokerContact
  removing: boolean
  onRemove: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [role, setRole] = useState<ContactRole>(contact.role)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)
  const idFor = (field: string) => `contact-${contact.id}-${field}`

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const parsed = contactSchema.safeParse({
      name: data.get("name"),
      role,
      email: data.get("email"),
      phone: data.get("phone"),
    })
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [
            String(issue.path[0]),
            issue.message,
          ])
        )
      )
      return
    }
    setErrors({})
    setPending(true)
    const result = await updateContact(organizationId, contact.id, parsed.data)
    setPending(false)
    if ("error" in result) {
      setErrors({ form: result.error })
      return
    }
    setEditing(false)
    toast.success(`${parsed.data.name} saved.`)
  }

  const error = (name: string) =>
    errors[name] ? [{ message: errors[name] }] : undefined

  if (editing) {
    return (
      <li className="px-4 py-3">
        <form onSubmit={save} noValidate className="flex flex-col gap-3">
          <fieldset disabled={pending} className="grid gap-3 sm:grid-cols-12">
            <Field data-invalid={!!errors.name} className="sm:col-span-3">
              <FieldLabel htmlFor={idFor("name")}>Name</FieldLabel>
              <Input
                id={idFor("name")}
                name="name"
                defaultValue={contact.name}
                autoFocus
              />
              <FieldError errors={error("name")} />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor={idFor("role")}>Role</FieldLabel>
              <Select
                value={role}
                onValueChange={(value) => setRole(value as ContactRole)}
                items={CONTACT_ROLES.map((value) => ({
                  value,
                  label: CONTACT_ROLE_LABELS[value],
                }))}
              >
                <SelectTrigger id={idFor("role")} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTACT_ROLES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {CONTACT_ROLE_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field data-invalid={!!errors.email} className="sm:col-span-4">
              <FieldLabel htmlFor={idFor("email")}>Email</FieldLabel>
              <Input
                id={idFor("email")}
                name="email"
                type="email"
                defaultValue={contact.email ?? undefined}
              />
              <FieldError errors={error("email")} />
            </Field>
            <Field data-invalid={!!errors.phone} className="sm:col-span-3">
              <FieldLabel htmlFor={idFor("phone")}>Phone</FieldLabel>
              <Input
                id={idFor("phone")}
                name="phone"
                type="tel"
                defaultValue={
                  contact.phone ? formatPhone(contact.phone) : undefined
                }
                onChange={handlePhoneInput}
                onKeyDown={handlePhoneKeyDown}
              />
              <FieldError errors={error("phone")} />
            </Field>
          </fieldset>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-destructive" role="status">
              {errors.form}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => {
                  setEditing(false)
                  setErrors({})
                  setRole(contact.role)
                }}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </form>
      </li>
    )
  }

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{contact.name}</span>
          <span className="rounded-4xl bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {CONTACT_ROLE_LABELS[contact.role]}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
          {contact.email && (
            <a href={`mailto:${contact.email}`} className="hover:underline">
              {contact.email}
            </a>
          )}
          {contact.phone && (
            <a href={`tel:${contact.phone}`} className="hover:underline">
              {formatPhone(contact.phone)}
            </a>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Edit ${contact.name}`}
          disabled={removing}
          onClick={() => setEditing(true)}
        >
          <Pencil />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove ${contact.name}`}
          disabled={removing}
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      </div>
    </li>
  )
}

/** The broker's people: who to call for loads, who to ask about payment. */
export function ContactsCard({
  organizationId,
  brokerId,
  contacts,
}: {
  organizationId: string
  brokerId: string
  contacts: BrokerContact[]
}) {
  const [role, setRole] = useState<ContactRole>("dispatch")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const parsed = contactSchema.safeParse({
      name: data.get("name"),
      role,
      email: data.get("email"),
      phone: data.get("phone"),
    })
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [
            String(issue.path[0]),
            issue.message,
          ])
        )
      )
      return
    }
    setErrors({})
    setPending(true)
    const result = await addContact(organizationId, brokerId, parsed.data)
    setPending(false)
    if ("error" in result) {
      setErrors({ form: result.error })
      return
    }
    form.reset()
    toast.success(`${parsed.data.name} added.`)
  }

  async function remove(contact: BrokerContact) {
    setRemoving(contact.id)
    const result = await removeContact(organizationId, contact.id)
    setRemoving(null)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      toast.success(`${contact.name} removed.`)
    }
  }

  const error = (name: string) =>
    errors[name] ? [{ message: errors[name] }] : undefined

  return (
    <SettingsCard
      title="Contacts"
      description="Dispatch for loads, billing and accounting for payment."
      contentClassName="flex flex-col gap-5"
    >
      {contacts.length === 0 ? (
        <SettingsEmptyState icon={UserPlus} title="No contacts yet">
          Add the people you deal with, so anyone on your team knows who to
          call.
        </SettingsEmptyState>
      ) : (
        <ul className="divide-y rounded-lg border">
          {contacts.map((contact) => (
            <ContactRow
              key={contact.id}
              organizationId={organizationId}
              contact={contact}
              removing={removing === contact.id}
              onRemove={() => remove(contact)}
            />
          ))}
        </ul>
      )}
      <form onSubmit={add} noValidate className="flex flex-col gap-3">
        <fieldset disabled={pending} className="grid gap-3 sm:grid-cols-12">
          <Field data-invalid={!!errors.name} className="sm:col-span-3">
            <FieldLabel htmlFor="contact-name">Name</FieldLabel>
            <Input id="contact-name" name="name" placeholder="e.g. Jen Ortiz" />
            <FieldError errors={error("name")} />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="contact-role">Role</FieldLabel>
            <Select
              value={role}
              onValueChange={(value) => setRole(value as ContactRole)}
              items={CONTACT_ROLES.map((value) => ({
                value,
                label: CONTACT_ROLE_LABELS[value],
              }))}
            >
              <SelectTrigger id="contact-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTACT_ROLES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {CONTACT_ROLE_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field data-invalid={!!errors.email} className="sm:col-span-4">
            <FieldLabel htmlFor="contact-email">Email</FieldLabel>
            <Input
              id="contact-email"
              name="email"
              type="email"
              placeholder="jen@tql.com"
            />
            <FieldError errors={error("email")} />
          </Field>
          <Field data-invalid={!!errors.phone} className="sm:col-span-3">
            <FieldLabel htmlFor="contact-phone">Phone</FieldLabel>
            <Input
              id="contact-phone"
              name="phone"
              type="tel"
              placeholder="(555) 123-4567"
              onChange={handlePhoneInput}
              onKeyDown={handlePhoneKeyDown}
            />
            <FieldError errors={error("phone")} />
          </Field>
        </fieldset>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-destructive" role="status">
            {errors.form}
          </p>
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            <UserPlus />
            {pending ? "Adding…" : "Add contact"}
          </Button>
        </div>
      </form>
    </SettingsCard>
  )
}
