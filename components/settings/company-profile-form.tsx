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
import {
  PROFILE_SECTIONS,
  SPANS,
  type FieldConfig,
  type FieldName,
  type ProfileSection,
} from "@/lib/company-profile-fields"
import type { OrganizationProfile } from "@/lib/organizations"
import { organizationProfileSchema } from "@/lib/schemas/organization"
import { createClient } from "@/lib/supabase/client"

const SECTIONS = PROFILE_SECTIONS

export { PROFILE_SECTIONS, type ProfileSection }

/** Saves some of the company profile. Returns an error message, if any. */
export async function saveCompanyProfile(
  organizationId: string,
  values: Partial<OrganizationProfile>
) {
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
}

/**
 * Validation and submit handling for one section of the profile. `omit`
 * leaves fields out, e.g. the name during onboarding, which was just chosen.
 */
export function useProfileSectionForm(
  section: ProfileSection,
  onValid: (values: Partial<OrganizationProfile>) => Promise<string | void>,
  omit: FieldName[] = []
) {
  const fields = useMemo(
    () =>
      (SECTIONS[section].fields as FieldConfig[]).filter(
        (field) => !omit.includes(field.name)
      ),
    // `omit` is a fixed list per call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [section]
  )
  const schema = useMemo(
    () =>
      organizationProfileSchema.pick(
        Object.fromEntries(fields.map((f) => [f.name, true])) as Partial<
          Record<FieldName, true>
        >
      ),
    [fields]
  )
  const form = useZodForm(schema, (values) =>
    onValid(values as Partial<OrganizationProfile>)
  )
  return {
    ...form,
    fields,
    errors: form.errors as Partial<Record<FieldName, { message: string }[]>>,
  }
}

/** The inputs for one section, laid out on a six-column grid. */
export function ProfileFields({
  fields,
  profile,
  errors,
  idPrefix = "company",
}: {
  fields: FieldConfig[]
  profile: Partial<OrganizationProfile>
  errors: Partial<Record<FieldName, { message: string }[]>>
  idPrefix?: string
}) {
  return fields.map((field) => {
    const id = `${idPrefix}-${field.name.replaceAll("_", "-")}`
    const fieldErrors = errors[field.name]
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
          field.hint && <FieldDescription>{field.hint}</FieldDescription>
        )}
      </Field>
    )
  })
}

/** One card of the company profile. Each card saves only its own fields. */
export function CompanyProfileSection({
  section,
  organizationId,
  profile,
  canEdit,
}: {
  section: ProfileSection
  organizationId: string
  profile: OrganizationProfile
  canEdit: boolean
}) {
  const { title, description } = SECTIONS[section]
  const router = useRouter()
  const [saved, setSaved] = useState(false)

  const { fields, errors, formError, pending, formProps } =
    useProfileSectionForm(section, async (values) => {
      setSaved(false)
      const error = await saveCompanyProfile(organizationId, values)
      if (error) {
        return error
      }
      setSaved(true)
      router.refresh()
    })

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
          <ProfileFields fields={fields} profile={profile} errors={errors} />
        </fieldset>
      </SettingsCard>
    </form>
  )
}
