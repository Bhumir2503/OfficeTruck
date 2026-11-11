"use client"

import { cn } from "cn"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useZodForm } from "@/hooks/use-zod-form"
import type { OrganizationProfile } from "@/lib/organizations"
import { organizationProfileSchema } from "@/lib/schemas/organization"
import { createClient } from "@/lib/supabase/client"

type FieldName = keyof OrganizationProfile

type FieldConfig = {
  name: FieldName
  label: string
  hint?: string
  /** Columns out of 6 on wider screens. */
  span: 2 | 3 | 6 | 1
  input?: React.ComponentProps<typeof Input>
}

const SPANS = {
  1: "sm:col-span-1",
  2: "sm:col-span-2",
  3: "sm:col-span-3",
  6: "sm:col-span-6",
}

const SECTIONS = {
  company: {
    title: "Company details",
    description: "Your company's name and operating authority.",
    fields: [
      {
        name: "name",
        label: "Company name",
        hint: "What your team sees in OfficeTruck.",
        span: 3,
        input: { required: true, autoComplete: "organization" },
      },
      {
        name: "legal_name",
        label: "Legal name",
        hint: "As registered with FMCSA, if different.",
        span: 3,
        input: { placeholder: "Acme Freight LLC" },
      },
      {
        name: "dot_number",
        label: "USDOT number",
        span: 3,
        input: { inputMode: "numeric", placeholder: "1234567" },
      },
      {
        name: "mc_number",
        label: "MC number",
        span: 3,
        input: { inputMode: "numeric", placeholder: "123456" },
      },
    ],
  },
  contact: {
    title: "Contact",
    description: "How brokers and shippers reach you. Shown on your invoices.",
    fields: [
      {
        name: "phone",
        label: "Phone",
        span: 3,
        input: {
          type: "tel",
          autoComplete: "tel",
          placeholder: "(555) 123-4567",
        },
      },
      {
        name: "email",
        label: "Email",
        span: 3,
        input: {
          type: "email",
          autoComplete: "email",
          placeholder: "dispatch@acmefreight.com",
        },
      },
    ],
  },
  address: {
    title: "Address",
    description: "Your mailing address, used on invoices and filings.",
    fields: [
      {
        name: "address_line1",
        label: "Street address",
        span: 6,
        input: { autoComplete: "address-line1" },
      },
      {
        name: "address_line2",
        label: "Suite, unit or building",
        span: 6,
        input: { autoComplete: "address-line2" },
      },
      {
        name: "city",
        label: "City",
        span: 3,
        input: { autoComplete: "address-level2" },
      },
      {
        name: "state",
        label: "State",
        span: 1,
        input: {
          autoComplete: "address-level1",
          maxLength: 2,
          placeholder: "TX",
          className: "uppercase",
        },
      },
      {
        name: "postal_code",
        label: "ZIP code",
        span: 2,
        input: { autoComplete: "postal-code", inputMode: "numeric" },
      },
    ],
  },
} satisfies Record<
  string,
  { title: string; description: string; fields: FieldConfig[] }
>

/** One card of the company profile. Each card saves only its own fields. */
export function CompanyProfileSection({
  section,
  organizationId,
  profile,
  canEdit,
}: {
  section: keyof typeof SECTIONS
  organizationId: string
  profile: OrganizationProfile
  canEdit: boolean
}) {
  const { title, description, fields } = SECTIONS[section]
  const router = useRouter()
  const [saved, setSaved] = useState(false)

  const schema = useMemo(
    () =>
      organizationProfileSchema.pick(
        Object.fromEntries(fields.map((f) => [f.name, true])) as Partial<
          Record<FieldName, true>
        >
      ),
    [fields]
  )

  const { errors, formError, pending, formProps } = useZodForm(
    schema,
    async (values) => {
      setSaved(false)
      const { data, error } = await createClient()
        .from("organizations")
        .update(values)
        .eq("id", organizationId)
        .select("id")
      if (error) {
        return error.message
      }
      // Row-level security skips the update, rather than failing, for non-admins.
      if (!data.length) {
        return "Only owners and admins can change the company profile."
      }
      setSaved(true)
      router.refresh()
    }
  )

  const errorsByField = errors as Partial<
    Record<FieldName, { message: string }[]>
  >

  return (
    <form
      {...formProps}
      onChange={(event) => {
        setSaved(false)
        formProps.onChange(event)
      }}
    >
      <SettingsCard
        title={title}
        description={description}
        footer={
          <SettingsCardFooter
            hint={
              !canEdit
                ? "Only owners and admins can make changes."
                : formError
                  ? null
                  : saved
                    ? "Changes saved."
                    : null
            }
          >
            {formError && <FieldError>{formError}</FieldError>}
            {canEdit && (
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
            )}
          </SettingsCardFooter>
        }
      >
        {/* A disabled fieldset makes every input read-only for members. */}
        <fieldset
          disabled={!canEdit || pending}
          className="grid gap-5 sm:grid-cols-6"
        >
          {(fields as FieldConfig[]).map((field) => {
            const id = `company-${field.name.replaceAll("_", "-")}`
            const fieldErrors = errorsByField[field.name]
            return (
              <Field
                key={field.name}
                data-invalid={!!fieldErrors}
                className={cn(SPANS[field.span])}
              >
                <FieldLabel htmlFor={id}>{field.label}</FieldLabel>
                <Input
                  id={id}
                  name={field.name}
                  defaultValue={profile[field.name] ?? ""}
                  aria-invalid={!!fieldErrors}
                  {...field.input}
                />
                {fieldErrors ? (
                  <FieldError errors={fieldErrors} />
                ) : (
                  field.hint && (
                    <FieldDescription>{field.hint}</FieldDescription>
                  )
                )}
              </Field>
            )
          })}
        </fieldset>
      </SettingsCard>
    </form>
  )
}
