import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  applicationDraftSchema,
  confirmDocumentSchema,
  employerCheckSchema,
  endDateSchema,
  notApplicableSchema,
  registrySignSchema,
  annualReviewSignSchema,
  uploadSchema,
} from "../lib/schemas/dq.ts"

const answers = {
  full_name: "Ana Torres",
  phone: "(405) 555-0118",
  addresses: [
    {
      street: "12 Elm St",
      city: "Tulsa",
      state: "ok",
      postal_code: "74103",
      from: "2022-01-01",
      to: null,
    },
  ],
  licenses: [
    {
      state: "OK",
      number: "R482931055",
      class: "A",
      endorsements: "",
      expires_on: "2028-03-01",
    },
  ],
  license_denied_or_suspended: false,
  license_denial_explanation: "",
  experience: [
    {
      equipment: "Tractor-trailer",
      from: "2019-04-01",
      to: null,
      approximate_miles: 400000,
    },
  ],
  accidents: [],
  convictions: [],
  employers: [
    {
      name: "Plains Freight",
      address: "1 Depot Rd, Amarillo, TX",
      phone: null,
      position: "Driver",
      from: "2021-01-01",
      to: "2026-10-01",
      reason_for_leaving: "Closer to home",
      subject_to_fmcsrs: true,
      safety_sensitive_testing: true,
    },
  ],
  employment_gaps: null,
}

describe("confirmDocumentSchema", () => {
  it("accepts the confirmed dates", () => {
    const value = confirmDocumentSchema.parse({
      issue_date: "2026-01-05",
      expiry_date: "2027-01-05",
    })
    assert.deepEqual(value, {
      issue_date: "2026-01-05",
      expiry_date: "2027-01-05",
      query_result: null,
    })
  })

  it("refuses an expiry before the issue date, and dates that don't exist", () => {
    assert.equal(
      confirmDocumentSchema.safeParse({
        issue_date: "2026-01-05",
        expiry_date: "2025-01-05",
      }).success,
      false
    )
    assert.equal(
      confirmDocumentSchema.safeParse({ issue_date: "2026-02-30" }).success,
      false
    )
    assert.equal(
      confirmDocumentSchema.safeParse({ issue_date: "01/05/2026" }).success,
      false
    )
  })

  it("only takes the two query results", () => {
    assert.equal(
      confirmDocumentSchema.safeParse({
        issue_date: "2026-01-05",
        query_result: "clear",
      }).success,
      false
    )
    assert.equal(
      confirmDocumentSchema.parse({
        issue_date: "2026-01-05",
        query_result: "record_found",
      }).query_result,
      "record_found"
    )
  })
})

describe("signing", () => {
  it("needs a name and the box ticked", () => {
    assert.equal(
      annualReviewSignSchema.safeParse({ signer_name: "Bhumi", agree: false })
        .success,
      false
    )
    assert.equal(
      annualReviewSignSchema.safeParse({ signer_name: "  ", agree: true })
        .success,
      false
    )
    assert.equal(
      annualReviewSignSchema.safeParse({ signer_name: "Bhumi", agree: true })
        .success,
      true
    )
  })

  it("needs the examiner's registry number as digits", () => {
    const base = {
      signer_name: "Bhumi",
      agree: true,
      examiner_name: "Dr. Lee",
      verified_on: "2026-01-05",
    }
    assert.equal(
      registrySignSchema.safeParse({ ...base, registry_number: "12-34" })
        .success,
      false
    )
    assert.equal(
      registrySignSchema.safeParse({ ...base, registry_number: "1234567890" })
        .success,
      true
    )
  })
})

describe("applicationDraftSchema", () => {
  it("accepts a filled-in application, upper-casing states", () => {
    const value = applicationDraftSchema.parse({
      answers,
      ssn: "123-45-6789",
      date_of_birth: "1988-04-02",
    })
    assert.equal(value.answers.addresses[0].state, "OK")
    assert.equal(value.answers.licenses[0].endorsements, null)
  })

  it("needs at least one address and license", () => {
    assert.equal(
      applicationDraftSchema.safeParse({
        answers: { ...answers, addresses: [] },
      }).success,
      false
    )
    assert.equal(
      applicationDraftSchema.safeParse({
        answers: { ...answers, licenses: [] },
      }).success,
      false
    )
  })

  it("never echoes the SSN in an error", () => {
    const result = applicationDraftSchema.safeParse({
      answers,
      ssn: "123-45-6789".repeat(3),
    })
    assert.equal(result.success, false)
    assert.ok(!JSON.stringify(result.error.issues).includes("123-45-6789"))
  })
})

describe("the rest", () => {
  it("logs employer contacts with a full timestamp", () => {
    const base = {
      employer_name: "Plains Freight",
      method: "phone",
      outcome: "no_response",
    }
    assert.equal(
      employerCheckSchema.safeParse({ ...base, contacted_at: "2026-11-16" })
        .success,
      false
    )
    assert.equal(
      employerCheckSchema.safeParse({
        ...base,
        contacted_at: "2026-11-16T15:00:00Z",
      }).success,
      true
    )
    assert.equal(
      employerCheckSchema.safeParse({
        ...base,
        outcome: "ghosted",
        contacted_at: "2026-11-16T15:00:00Z",
      }).success,
      false
    )
  })

  it("needs a reason to mark an item not applicable", () => {
    assert.equal(notApplicableSchema.safeParse({ reason: " " }).success, false)
    assert.equal(
      notApplicableSchema.parse({ reason: "  Rehired within 30 days  " })
        .reason,
      "Rehired within 30 days"
    )
  })

  it("checks the end date", () => {
    assert.equal(
      endDateSchema.safeParse({ end_date: "2026-13-01" }).success,
      false
    )
  })

  it("takes photos and PDFs up to 10 MB", () => {
    const file = {
      file_name: "mvr.pdf",
      content_type: "application/pdf",
      size_bytes: 1000,
    }
    assert.equal(uploadSchema.safeParse(file).success, true)
    assert.equal(
      uploadSchema.safeParse({ ...file, content_type: "image/heic" }).success,
      false
    )
    assert.equal(
      uploadSchema.safeParse({ ...file, size_bytes: 11 * 1024 * 1024 }).success,
      false
    )
  })
})
