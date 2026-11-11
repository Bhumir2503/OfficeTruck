import type { ComponentProps } from "react"

import type { OrganizationProfile } from "@/lib/organizations"

// Shared by the settings form, the onboarding popup and the settings loading
// skeleton, so all three lay the fields out the same way.

export type FieldName = keyof OrganizationProfile

export type FieldConfig = {
  name: FieldName
  label: string
  hint?: string
  /** Columns out of 6 on wider screens. */
  span: 2 | 3 | 6 | 1
  input?: ComponentProps<"input">
}

export const SPANS = {
  1: "sm:col-span-1",
  2: "sm:col-span-2",
  3: "sm:col-span-3",
  6: "sm:col-span-6",
}

export const PROFILE_SECTIONS = {
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

export type ProfileSection = keyof typeof PROFILE_SECTIONS
