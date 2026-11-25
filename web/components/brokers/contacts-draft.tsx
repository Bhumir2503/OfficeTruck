"use client"

import { Trash2, UserPlus } from "lucide-react"
import { useState } from "react"

import { SettingsCard } from "@/components/settings/settings-card"
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
import { formatPhone, handlePhoneInput, handlePhoneKeyDown } from "@/lib/phone"
import {
  CONTACT_ROLES,
  CONTACT_ROLE_LABELS,
  contactSchema,
  type ContactRole,
  type ContactValues,
} from "@/lib/schemas/broker"

const EMPTY = { name: "", email: "", phone: "" }

/**
 * Contacts for a broker that hasn't been saved yet. They're kept here and
 * saved along with the broker. The inputs have no `name`, so they aren't
 * part of the broker form's own data.
 */
export function ContactsDraft({
  contacts,
  onChange,
  disabled,
}: {
  contacts: ContactValues[]
  onChange: (contacts: ContactValues[]) => void
  disabled?: boolean
}) {
  const [draft, setDraft] = useState(EMPTY)
  const [role, setRole] = useState<ContactRole>("dispatch")
  const [errors, setErrors] = useState<Record<string, string>>({})

  function add() {
    const parsed = contactSchema.safeParse({ ...draft, role })
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
    onChange([...contacts, parsed.data])
    setDraft(EMPTY)
  }

  // Enter adds the contact, rather than submitting the whole broker form.
  const onEnter = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault()
      add()
    }
  }
  const error = (name: string) =>
    errors[name] ? [{ message: errors[name] }] : undefined

  return (
    <SettingsCard
      title="Contacts"
      description="Optional. Dispatch for loads, billing and accounting for payment. Saved with the broker."
      contentClassName="flex flex-col gap-5"
    >
      {contacts.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {contacts.map((contact, index) => (
            <li
              key={index}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{contact.name}</span>
                  <span className="rounded-4xl bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {CONTACT_ROLE_LABELS[contact.role]}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
                  {contact.email && <span>{contact.email}</span>}
                  {contact.phone && <span>{formatPhone(contact.phone)}</span>}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${contact.name}`}
                disabled={disabled}
                onClick={() =>
                  onChange(contacts.filter((_, other) => other !== index))
                }
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-3 sm:grid-cols-12">
        <Field data-invalid={!!errors.name} className="sm:col-span-3">
          <FieldLabel htmlFor="new-contact-name">Name</FieldLabel>
          <Input
            id="new-contact-name"
            placeholder="e.g. Jen Ortiz"
            value={draft.name}
            disabled={disabled}
            onChange={(event) =>
              setDraft({ ...draft, name: event.target.value })
            }
            onKeyDown={onEnter}
          />
          <FieldError errors={error("name")} />
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="new-contact-role">Role</FieldLabel>
          <Select
            value={role}
            onValueChange={(value) => setRole(value as ContactRole)}
            items={CONTACT_ROLES.map((value) => ({
              value,
              label: CONTACT_ROLE_LABELS[value],
            }))}
          >
            <SelectTrigger
              id="new-contact-role"
              className="w-full"
              disabled={disabled}
            >
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
          <FieldLabel htmlFor="new-contact-email">Email</FieldLabel>
          <Input
            id="new-contact-email"
            type="email"
            placeholder="jen@tql.com"
            value={draft.email}
            disabled={disabled}
            onChange={(event) =>
              setDraft({ ...draft, email: event.target.value.toLowerCase() })
            }
            onKeyDown={onEnter}
          />
          <FieldError errors={error("email")} />
        </Field>
        <Field data-invalid={!!errors.phone} className="sm:col-span-3">
          <FieldLabel htmlFor="new-contact-phone">Phone</FieldLabel>
          <Input
            id="new-contact-phone"
            type="tel"
            placeholder="(555) 123-4567"
            value={draft.phone}
            disabled={disabled}
            onChange={(event) => {
              handlePhoneInput(event)
              setDraft({ ...draft, phone: event.currentTarget.value })
            }}
            onKeyDown={(event) => {
              handlePhoneKeyDown(event)
              onEnter(event)
            }}
          />
          <FieldError errors={error("phone")} />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={add}
        >
          <UserPlus />
          Add to list
        </Button>
      </div>
    </SettingsCard>
  )
}
