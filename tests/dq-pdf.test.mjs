import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { inflateSync } from "node:zlib"
import { PDFDocument } from "pdf-lib"

import {
  applicationPdf,
  auditExportPdf,
  latin1,
  signedNotePdf,
} from "../lib/dq-pdf.ts"

const footer =
  "OfficeTruck organizes these records. It does not certify that a carrier meets federal rules."
const signature = {
  signerName: "Ana Torres",
  signerRole: "driver",
  signedAt: "2026-11-16T15:04:05.000Z",
}
// A 1x1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
)

const pages = async (bytes) => (await PDFDocument.load(bytes)).getPageCount()

/**
 * The text pdf-lib wrote: its page streams are compressed, and the text in
 * them is stored as hex strings.
 */
async function textOf(bytes) {
  const raw = Buffer.from(bytes)
  const streams = []
  let at = 0
  for (;;) {
    const start = raw.indexOf("stream", at, "latin1")
    if (start < 0) break
    const bodyStart = start + (raw[start + 6] === 0x0d ? 8 : 7)
    const end = raw.indexOf("endstream", bodyStart, "latin1")
    try {
      streams.push(inflateSync(raw.subarray(bodyStart, end)).toString("latin1"))
    } catch {
      streams.push(raw.subarray(bodyStart, end).toString("latin1"))
    }
    at = end + 9
  }
  return streams
    .flatMap((s) => [...s.matchAll(/<([0-9A-F]+)>/g)])
    .map((m) => Buffer.from(m[1], "hex").toString("latin1"))
    .join(" ")
}

describe("signedNotePdf", () => {
  it("prints the note with the signer, role and time", async () => {
    const pdf = await signedNotePdf({
      organizationName: "ACME Freight",
      title: "Annual review of driving record",
      driverName: "Ana Torres",
      fields: [["Driving record dated", "2026-02-27"]],
      statement: "I reviewed the driving record dated 2026-02-27.",
      signature: { ...signature, signerName: "Bhumi P", signerRole: "owner" },
      footer,
    })
    assert.equal(await pages(pdf), 1)
    const text = await textOf(pdf)
    assert.match(
      text,
      /Signed electronically by Bhumi P \(Owner\) on Nov 16, 2026, 15:04 UTC/
    )
    assert.match(text, /does not certify/)
  })
})

describe("applicationPdf", () => {
  const answers = {
    full_name: "Ana Torres",
    phone: null,
    addresses: [
      {
        street: "12 Elm St",
        city: "Tulsa",
        state: "OK",
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
        endorsements: null,
        expires_on: "2028-03-01",
      },
    ],
    license_denied_or_suspended: false,
    license_denial_explanation: null,
    experience: [],
    accidents: [],
    convictions: [],
    employers: Array.from({ length: 12 }, (_, i) => ({
      name: `Carrier ${i}`,
      address: "1 Depot Rd, Amarillo, TX",
      phone: null,
      position: "Driver",
      from: "2015-01-01",
      to: "2016-01-01",
      reason_for_leaving: "Moved on",
      subject_to_fmcsrs: true,
      safety_sensitive_testing: true,
    })),
    employment_gaps: null,
  }

  it("shows only the SSN's last 4 and keeps the date of birth off the page", async () => {
    const pdf = await applicationPdf({
      organizationName: "ACME Freight",
      answers,
      ssnLast4: "6789",
      dateOfBirthOnFile: true,
      statement: "This certifies that this application was completed by me.",
      signature,
      footer,
    })
    const text = await textOf(pdf)
    assert.match(text, /\*\*\*-\*\*-6789/)
    assert.match(text, /On file \(kept encrypted\)/)
    assert.match(text, /Signed electronically by Ana Torres \(Driver\)/)
  })

  it("flows onto more pages as needed", async () => {
    const pdf = await applicationPdf({
      organizationName: "ACME Freight",
      answers,
      ssnLast4: null,
      dateOfBirthOnFile: false,
      statement: "This certifies that this application was completed by me.",
      signature,
      footer,
    })
    assert.ok((await pages(pdf)) >= 2)
  })
})

describe("auditExportPdf", () => {
  it("has a cover sheet, then each document in order", async () => {
    const attached = await PDFDocument.create()
    attached.addPage()
    attached.addPage()
    const pdf = await auditExportPdf({
      organizationName: "ACME Freight",
      driverName: "Ana Torres",
      fileLabel: "Driver qualification file",
      statusLine: "Audit-ready",
      generatedAt: "2026-11-16T15:00:00Z",
      rows: [
        {
          title: "Road test certificate",
          cfrRef: "391.31, 391.33",
          date: "2026-01-05",
          status: "Complete",
        },
        {
          title: "Annual driving record (MVR)",
          cfrRef: "391.25(a)",
          date: "Due 2027-01-05",
          status: "Upcoming",
        },
      ],
      sections: [
        {
          heading: "Previous-employer contacts",
          lines: ["2026-01-10 Plains Freight. Phone: No response."],
        },
      ],
      files: [
        { label: "Road test: photo", contentType: "image/png", bytes: PNG },
        {
          label: "Medical card",
          contentType: "application/pdf",
          bytes: await attached.save(),
        },
        {
          label: "Broken",
          contentType: "application/pdf",
          bytes: new Uint8Array([1, 2, 3]),
        },
      ],
      footer,
    })
    // Cover, the photo, the two-page PDF, and a note for the broken file.
    assert.equal(await pages(pdf), 5)
    const text = await textOf(pdf)
    assert.match(text, /Audit-ready/)
    assert.match(text, /391\.25\(a\)/)
    assert.match(text, /couldn't be added to the export/)
    assert.ok(!/\bcompliant\b/i.test(text))
  })
})

describe("latin1", () => {
  it("swaps characters the PDF fonts can't draw", () => {
    assert.equal(latin1("“Hi” — it’s •••-6789 ✓"), '"Hi" - it\'s ***-6789 ')
  })
})
