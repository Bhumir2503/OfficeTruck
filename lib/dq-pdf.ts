import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib"

import type { ApplicationAnswers } from "@/lib/schemas/dq"

/*
 * PDFs for DQ files: the three signed records the app makes (employment
 * application, annual review note, registry-verification note) and the
 * audit export. Only pdf-lib, so they can be built and tested anywhere.
 *
 * Never put a full SSN or the date of birth in a PDF: the files are readable
 * by everyone who can see the driver's file. The SSN shows as its last 4.
 */

const PAGE: [number, number] = [612, 792] // US letter, points
const MARGIN = 54
const INK = rgb(0.09, 0.09, 0.09)
const MUTED = rgb(0.42, 0.42, 0.42)
const RULE = rgb(0.85, 0.85, 0.85)
// The brand's dark emerald.
const BRAND = rgb(0x06 / 255, 0x4e / 255, 0x3b / 255)

type Fonts = { regular: PDFFont; bold: PDFFont; signature: PDFFont }

/**
 * The standard PDF fonts only cover Latin-1, so swap common characters
 * outside it and drop the rest instead of failing.
 */
export function latin1(value: string): string {
  return value
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/•/g, "*")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "")
}

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = []
  for (const paragraph of latin1(text).split("\n")) {
    let line = ""
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(next, size) <= width || !line) {
        line = next
      } else {
        lines.push(line)
        line = word
      }
    }
    lines.push(line)
  }
  return lines
}

/** Writes pages top to bottom, adding a page when one fills up. */
class Writer {
  readonly doc: PDFDocument
  readonly fonts: Fonts
  readonly footer: string
  readonly width = PAGE[0] - MARGIN * 2
  page: PDFPage
  y: number

  constructor(doc: PDFDocument, fonts: Fonts, footer: string) {
    this.doc = doc
    this.fonts = fonts
    this.footer = footer
    this.page = this.addPage()
    this.y = PAGE[1] - MARGIN
  }

  addPage() {
    const page = this.doc.addPage(PAGE)
    for (const [index, line] of wrap(
      this.footer,
      this.fonts.regular,
      8,
      this.width
    ).entries()) {
      page.drawText(line, {
        x: MARGIN,
        y: MARGIN - 24 - index * 10,
        size: 8,
        font: this.fonts.regular,
        color: MUTED,
      })
    }
    this.page = page
    this.y = PAGE[1] - MARGIN
    return page
  }

  ensure(height: number) {
    if (this.y - height < MARGIN) this.addPage()
  }

  text(
    value: string,
    options: {
      size?: number
      bold?: boolean
      color?: typeof INK
      x?: number
    } = {}
  ) {
    const size = options.size ?? 10
    const font = options.bold ? this.fonts.bold : this.fonts.regular
    const x = options.x ?? MARGIN
    for (const line of wrap(value, font, size, this.width - (x - MARGIN))) {
      this.ensure(size * 1.4)
      this.page.drawText(line, {
        x,
        y: this.y - size,
        size,
        font,
        color: options.color ?? INK,
      })
      this.y -= size * 1.4
    }
  }

  gap(points: number) {
    this.y -= points
  }

  rule() {
    this.ensure(8)
    this.page.drawLine({
      start: { x: MARGIN, y: this.y - 4 },
      end: { x: MARGIN + this.width, y: this.y - 4 },
      thickness: 0.5,
      color: RULE,
    })
    this.y -= 10
  }

  /** A label above its value. */
  field(label: string, value: string) {
    this.text(label, { size: 8, color: MUTED })
    this.text(value || "-", { size: 10 })
    this.gap(4)
  }

  heading(value: string) {
    this.gap(6)
    this.ensure(30)
    this.text(value, { size: 12, bold: true, color: BRAND })
    this.gap(2)
  }
}

async function newDocument(title: string) {
  const doc = await PDFDocument.create()
  doc.setTitle(latin1(title))
  doc.setCreator("OfficeTruck")
  doc.setProducer("OfficeTruck")
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    signature: await doc.embedFont(StandardFonts.TimesRomanItalic),
  }
  return { doc, fonts }
}

function header(w: Writer, organizationName: string, title: string) {
  w.text(organizationName, { size: 10, bold: true, color: BRAND })
  w.gap(4)
  w.text(title, { size: 18, bold: true })
  w.gap(8)
}

export type Signature = {
  signerName: string
  signerRole: "owner" | "admin" | "driver"
  /** ISO timestamp. */
  signedAt: string
}

const ROLE_LABELS = { owner: "Owner", admin: "Admin", driver: "Driver" }

/** "2026-11-16T15:04:05.000Z" → "Nov 16, 2026, 15:04 UTC" */
export function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  const day = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
  const time = date.toISOString().slice(11, 16)
  return `${day}, ${time} UTC`
}

function signatureBlock(w: Writer, statement: string, signature: Signature) {
  w.heading("Signature")
  w.text(statement, { size: 10 })
  w.gap(14)
  w.ensure(60)
  w.page.drawText(latin1(signature.signerName), {
    x: MARGIN,
    y: w.y - 22,
    size: 22,
    font: w.fonts.signature,
    color: INK,
  })
  w.y -= 30
  w.rule()
  w.text(
    `Signed electronically by ${signature.signerName} (${ROLE_LABELS[signature.signerRole]}) on ${formatTimestamp(signature.signedAt)}.`,
    { size: 9, color: MUTED }
  )
}

// -------------------------------------------------- Signed office notes --

export type SignedNote = {
  organizationName: string
  title: string
  driverName: string
  fields: [label: string, value: string][]
  statement: string
  signature: Signature
  footer: string
}

/** The annual review note or the registry-verification note. */
export async function signedNotePdf(note: SignedNote): Promise<Uint8Array> {
  const { doc, fonts } = await newDocument(`${note.title}: ${note.driverName}`)
  const w = new Writer(doc, fonts, note.footer)
  header(w, note.organizationName, note.title)
  w.field("Driver", note.driverName)
  for (const [label, value] of note.fields) w.field(label, value)
  signatureBlock(w, note.statement, note.signature)
  return doc.save()
}

// --------------------------------------------- Employment application --

export type ApplicationPdfInput = {
  organizationName: string
  answers: ApplicationAnswers
  /** Only the last 4 digits ever reach a PDF. */
  ssnLast4: string | null
  dateOfBirthOnFile: boolean
  statement: string
  signature: Signature
  footer: string
}

const range = (from: string, to: string | null) => `${from} to ${to ?? "now"}`
const yesNo = (value: boolean) => (value ? "Yes" : "No")

export async function applicationPdf(
  input: ApplicationPdfInput
): Promise<Uint8Array> {
  const a = input.answers
  const { doc, fonts } = await newDocument(
    `Employment application: ${a.full_name}`
  )
  const w = new Writer(doc, fonts, input.footer)
  header(w, input.organizationName, "Application for employment")

  w.heading("Applicant")
  w.field("Name", a.full_name)
  w.field("Phone", a.phone ?? "")
  w.field(
    "Social Security number",
    input.ssnLast4 ? `***-**-${input.ssnLast4}` : "Not given"
  )
  w.field(
    "Date of birth",
    input.dateOfBirthOnFile ? "On file (kept encrypted)" : "Not given"
  )

  w.heading("Addresses, past 3 years")
  for (const item of a.addresses) {
    w.text(
      `${item.street}, ${item.city}, ${item.state} ${item.postal_code} (${range(item.from, item.to)})`
    )
  }

  w.heading("Driver's licenses, past 3 years")
  for (const item of a.licenses) {
    w.text(
      `${item.state} ${item.number}, class ${item.class}${item.endorsements ? `, endorsements ${item.endorsements}` : ""}, expires ${item.expires_on}`
    )
  }
  w.field(
    "Ever denied a license, or had one suspended or revoked",
    yesNo(a.license_denied_or_suspended)
  )
  if (a.license_denial_explanation) {
    w.field("Explanation", a.license_denial_explanation)
  }

  w.heading("Driving experience")
  if (!a.experience.length) w.text("None listed.", { color: MUTED })
  for (const item of a.experience) {
    w.text(
      `${item.equipment} (${range(item.from, item.to)})${item.approximate_miles !== null ? `, about ${item.approximate_miles.toLocaleString("en-US")} miles` : ""}`
    )
  }

  w.heading("Accidents, past 3 years")
  if (!a.accidents.length) w.text("None.", { color: MUTED })
  for (const item of a.accidents) {
    w.text(
      `${item.date}: ${item.nature}. Fatalities ${item.fatalities}, injuries ${item.injuries}.`
    )
  }

  w.heading("Traffic convictions, past 3 years")
  if (!a.convictions.length) w.text("None.", { color: MUTED })
  for (const item of a.convictions) {
    w.text(
      `${item.date}, ${item.location}: ${item.charge}. Penalty: ${item.penalty}.`
    )
  }

  w.heading("Employers")
  if (!a.employers.length) w.text("None listed.", { color: MUTED })
  for (const item of a.employers) {
    w.text(item.name, { bold: true })
    w.text(`${item.address}${item.phone ? `, ${item.phone}` : ""}`)
    w.text(
      `${item.position}, ${range(item.from, item.to)}. Left: ${item.reason_for_leaving}.`
    )
    w.text(
      `Subject to the FMCSRs: ${yesNo(item.subject_to_fmcsrs)}. Safety-sensitive job under DOT drug and alcohol testing: ${yesNo(item.safety_sensitive_testing)}.`,
      { size: 9, color: MUTED }
    )
    w.gap(4)
  }
  if (a.employment_gaps) w.field("Gaps in employment", a.employment_gaps)

  signatureBlock(w, input.statement, input.signature)
  return doc.save()
}

// ---------------------------------------------------------- Audit export --

export type ExportRow = {
  title: string
  cfrRef: string
  /** The date that matters: done, due, or "-". */
  date: string
  status: string
}

export type ExportFile = {
  label: string
  /** PNG, JPEG or PDF. Anything else gets a page saying it's kept separately. */
  contentType: string
  bytes: Uint8Array
}

export type AuditExport = {
  organizationName: string
  driverName: string
  fileLabel: string
  /** "Audit-ready", or the counts. */
  statusLine: string
  generatedAt: string
  rows: ExportRow[]
  /** Text after the cover table, like the previous-employer contact log. */
  sections?: { heading: string; lines: string[] }[]
  files: ExportFile[]
  footer: string
}

async function addFile(w: Writer, file: ExportFile) {
  const { doc } = w
  const titlePage = () => {
    w.addPage()
    w.text(file.label, { size: 12, bold: true })
  }
  try {
    if (file.contentType === "application/pdf") {
      const source = await PDFDocument.load(file.bytes, {
        ignoreEncryption: true,
      })
      for (const page of await doc.copyPages(source, source.getPageIndices())) {
        doc.addPage(page)
      }
      return
    }
    if (file.contentType === "image/png" || file.contentType === "image/jpeg") {
      const image =
        file.contentType === "image/png"
          ? await doc.embedPng(file.bytes)
          : await doc.embedJpg(file.bytes)
      titlePage()
      const top = w.y - 8
      const scale = Math.min(
        w.width / image.width,
        (top - MARGIN) / image.height,
        1
      )
      w.page.drawImage(image, {
        x: MARGIN,
        y: top - image.height * scale,
        width: image.width * scale,
        height: image.height * scale,
      })
      return
    }
  } catch {
    // Falls through to the note below.
  }
  titlePage()
  w.text(
    "This file couldn't be added to the export. It's kept in OfficeTruck with the driver's file.",
    { color: MUTED }
  )
}

/**
 * One driver's file as a single PDF: a cover sheet listing each item, its
 * rule, date and status, then the documents in checklist order.
 */
export async function auditExportPdf(input: AuditExport): Promise<Uint8Array> {
  const { doc, fonts } = await newDocument(
    `${input.fileLabel}: ${input.driverName}`
  )
  doc.setSubject(latin1(input.fileLabel))
  doc.setAuthor(latin1(input.organizationName))
  const w = new Writer(doc, fonts, input.footer)
  header(w, input.organizationName, input.fileLabel)
  w.field("Driver", input.driverName)
  w.field("Status", input.statusLine)
  w.field("Generated", formatTimestamp(input.generatedAt))

  // The cover table.
  const columns = [
    { label: "Item", x: MARGIN, width: 250 },
    { label: "Rule", x: MARGIN + 258, width: 92 },
    { label: "Date", x: MARGIN + 356, width: 70 },
    { label: "Status", x: MARGIN + 432, width: 72 },
  ]
  const tableHeader = () => {
    w.ensure(24)
    for (const column of columns) {
      w.page.drawText(column.label, {
        x: column.x,
        y: w.y - 9,
        size: 8,
        font: fonts.bold,
        color: MUTED,
      })
    }
    w.y -= 14
    w.rule()
  }
  w.gap(6)
  tableHeader()
  for (const row of input.rows) {
    const cells = [row.title, row.cfrRef, row.date, row.status].map(
      (value, index) => wrap(value, fonts.regular, 9, columns[index]!.width)
    )
    const height = Math.max(...cells.map((lines) => lines.length)) * 12 + 6
    if (w.y - height < MARGIN) {
      w.addPage()
      tableHeader()
    }
    cells.forEach((lines, index) => {
      lines.forEach((line, lineIndex) => {
        w.page.drawText(line, {
          x: columns[index]!.x,
          y: w.y - 9 - lineIndex * 12,
          size: 9,
          font: index === 3 ? fonts.bold : fonts.regular,
          color: INK,
        })
      })
    })
    w.y -= height
  }

  for (const section of input.sections ?? []) {
    w.heading(section.heading)
    for (const line of section.lines) {
      w.text(line, { size: 9 })
      w.gap(2)
    }
  }

  for (const file of input.files) {
    await addFile(w, file)
  }
  return doc.save()
}
