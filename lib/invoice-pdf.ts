import "server-only"

import {
  degrees,
  PDFDocument,
  type PDFFont,
  type PDFPage,
  rgb,
  StandardFonts,
} from "pdf-lib"

import { formatInvoiceDate, formatTerms } from "@/lib/invoice-format"
import { formatRate } from "@/lib/load-format"

/** What goes on the invoice page. Plain text; the caller has worked it out. */
export type InvoicePage = {
  number: number
  draft: boolean
  /** "YYYY-MM-DD" */
  invoice_date: string
  due_on: string
  terms_days: number
  from: {
    name: string
    lines: string[]
    /** "MC 123456 · USDOT 1234567" and the like. */
    ids: string | null
    contact: string | null
  }
  bill_to: { name: string; lines: string[] }
  /** Set when the invoice is factored: who to pay instead. */
  remit_to: { name: string; lines: string[] } | null
  load: {
    reference: string
    reference_numbers: string | null
    pickup: string
    delivery: string
    /** "Dry van · 42,000 lbs · Paper goods" */
    freight: string | null
    stops: number
  }
  /** "Linehaul", "Detention: 3 hrs at shipper" */
  lines: { label: string; amount: number }[]
  total: number
  notes: string | null
}

/** A document to add after the invoice page. */
export type PacketFile = {
  label: string
  file_name: string
  content_type: string
  bytes: Uint8Array
}

const PAGE: [number, number] = [612, 792] // US Letter, in points.
const MARGIN = 54
const INK = rgb(0.09, 0.09, 0.09)
const MUTED = rgb(0.42, 0.42, 0.42)
const RULE = rgb(0.85, 0.85, 0.85)
const ACCENT = rgb(0, 0.478, 0.333) // #007a55, the app's green.

/** The standard fonts only cover Latin-1, so swap or drop anything else. */
function latin1(text: string) {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[•·]/g, "·")
    .replace(/[^\x20-\x7e -ÿ]/g, "")
}

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = []
  for (const paragraph of latin1(text).split(/\r?\n/)) {
    let line = ""
    for (const word of paragraph.split(/\s+/)) {
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

type Fonts = { regular: PDFFont; bold: PDFFont }

function text(
  page: PDFPage,
  value: string,
  x: number,
  y: number,
  {
    font,
    size = 10,
    color = INK,
    align = "left",
  }: {
    font: PDFFont
    size?: number
    color?: ReturnType<typeof rgb>
    align?: "left" | "right"
  }
) {
  const clean = latin1(value)
  const width = font.widthOfTextAtSize(clean, size)
  page.drawText(clean, {
    x: align === "right" ? x - width : x,
    y,
    size,
    font,
    color,
  })
}

/** A small grey label over a block of lines. Returns the y below it. */
function block(
  page: PDFPage,
  fonts: Fonts,
  label: string,
  name: string,
  lines: string[],
  x: number,
  y: number,
  width: number
) {
  text(page, label.toUpperCase(), x, y, {
    font: fonts.bold,
    size: 8,
    color: MUTED,
  })
  y -= 15
  for (const line of wrap(name, fonts.bold, 11, width)) {
    text(page, line, x, y, { font: fonts.bold, size: 11 })
    y -= 14
  }
  for (const line of lines) {
    for (const part of wrap(line, fonts.regular, 10, width)) {
      text(page, part, x, y, { font: fonts.regular, color: MUTED })
      y -= 13
    }
  }
  return y
}

function drawInvoicePage(doc: PDFDocument, fonts: Fonts, data: InvoicePage) {
  const page = doc.addPage(PAGE)
  const [width, height] = PAGE
  const right = width - MARGIN
  const contentWidth = width - MARGIN * 2
  let y = height - MARGIN

  if (data.draft) {
    page.drawText("DRAFT", {
      x: 150,
      y: 330,
      size: 120,
      font: fonts.bold,
      color: rgb(0.93, 0.93, 0.93),
      rotate: degrees(35),
    })
  }

  // From, on the left; the invoice number and dates on the right.
  const fromBottom = block(
    page,
    fonts,
    "From",
    data.from.name,
    [
      ...data.from.lines,
      ...(data.from.contact ? [data.from.contact] : []),
      ...(data.from.ids ? [data.from.ids] : []),
    ],
    MARGIN,
    y,
    contentWidth / 2 - 12
  )

  text(page, "INVOICE", right, y - 18, {
    font: fonts.bold,
    size: 26,
    color: ACCENT,
    align: "right",
  })
  const meta: [string, string][] = [
    ["Invoice #", String(data.number)],
    ["Invoice date", formatInvoiceDate(data.invoice_date)],
    ["Terms", formatTerms(data.terms_days)],
    ["Due date", formatInvoiceDate(data.due_on)],
  ]
  let metaY = y - 44
  for (const [label, value] of meta) {
    text(page, label, right - 110, metaY, {
      font: fonts.regular,
      color: MUTED,
      align: "right",
    })
    text(page, value, right, metaY, { font: fonts.bold, align: "right" })
    metaY -= 15
  }

  y = Math.min(fromBottom, metaY) - 20
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: right, y },
    thickness: 0.75,
    color: RULE,
  })
  y -= 22

  // Bill to, and remit to when it's factored.
  const half = contentWidth / 2 - 12
  const billBottom = block(
    page,
    fonts,
    "Bill to",
    data.bill_to.name,
    data.bill_to.lines,
    MARGIN,
    y,
    half
  )
  const remitBottom = data.remit_to
    ? block(
        page,
        fonts,
        "Remit payment to",
        data.remit_to.name,
        data.remit_to.lines,
        MARGIN + contentWidth / 2 + 12,
        y,
        half
      )
    : y
  y = Math.min(billBottom, remitBottom) - 10

  if (data.remit_to) {
    const notice = `This invoice has been assigned to ${data.remit_to.name}. Pay only to ${data.remit_to.name} at the address above.`
    for (const line of wrap(notice, fonts.bold, 9, contentWidth)) {
      text(page, line, MARGIN, y, { font: fonts.bold, size: 9 })
      y -= 12
    }
    y -= 6
  }

  // The load.
  y -= 8
  text(page, "LOAD", MARGIN, y, { font: fonts.bold, size: 8, color: MUTED })
  y -= 16
  const facts: [string, string][] = [
    ["Load #", data.load.reference],
    ...(data.load.reference_numbers
      ? ([["Reference", data.load.reference_numbers]] as [string, string][])
      : []),
    ["Pickup", data.load.pickup],
    [data.load.stops > 2 ? "Final delivery" : "Delivery", data.load.delivery],
    ...(data.load.freight
      ? ([["Freight", data.load.freight]] as [string, string][])
      : []),
  ]
  for (const [label, value] of facts) {
    text(page, label, MARGIN, y, { font: fonts.regular, color: MUTED })
    const lines = wrap(value, fonts.regular, 10, contentWidth - 100)
    for (const line of lines) {
      text(page, line, MARGIN + 100, y, { font: fonts.regular })
      y -= 13
    }
    y -= 2
  }

  // The charges.
  y -= 16
  page.drawRectangle({
    x: MARGIN,
    y: y - 6,
    width: contentWidth,
    height: 22,
    color: rgb(0.96, 0.96, 0.96),
  })
  text(page, "Description", MARGIN + 8, y, { font: fonts.bold, size: 9 })
  text(page, "Amount", right - 8, y, {
    font: fonts.bold,
    size: 9,
    align: "right",
  })
  y -= 26
  for (const line of data.lines) {
    const label = wrap(line.label, fonts.regular, 10, contentWidth - 140)
    text(page, formatRate(line.amount), right - 8, y, {
      font: fonts.regular,
      align: "right",
    })
    for (const part of label) {
      text(page, part, MARGIN + 8, y, { font: fonts.regular })
      y -= 13
    }
    y -= 6
    page.drawLine({
      start: { x: MARGIN, y: y + 8 },
      end: { x: right, y: y + 8 },
      thickness: 0.5,
      color: RULE,
    })
  }
  y -= 8
  text(page, "Total due", right - 120, y, {
    font: fonts.bold,
    size: 12,
    align: "right",
  })
  text(page, formatRate(data.total), right - 8, y, {
    font: fonts.bold,
    size: 12,
    align: "right",
  })
  y -= 30

  if (data.notes) {
    text(page, "NOTES", MARGIN, y, { font: fonts.bold, size: 8, color: MUTED })
    y -= 15
    for (const line of wrap(data.notes, fonts.regular, 10, contentWidth)) {
      if (y < MARGIN + 30) break
      text(page, line, MARGIN, y, { font: fonts.regular })
      y -= 13
    }
  }

  const footer = data.remit_to
    ? `Questions about this invoice? Contact ${data.from.name}${data.from.contact ? `, ${data.from.contact}` : ""}.`
    : `Please include invoice # ${data.number} with your payment. Thank you for your business.`
  for (const [index, line] of wrap(
    footer,
    fonts.regular,
    9,
    contentWidth
  ).entries()) {
    text(page, line, MARGIN, MARGIN - index * 11, {
      font: fonts.regular,
      size: 9,
      color: MUTED,
    })
  }
}

/** An image on its own letter page, scaled to fit inside the margins. */
async function addImagePage(doc: PDFDocument, file: PacketFile) {
  const image =
    file.content_type === "image/png"
      ? await doc.embedPng(file.bytes)
      : await doc.embedJpg(file.bytes)
  const landscape = image.width > image.height
  const size: [number, number] = landscape ? [PAGE[1], PAGE[0]] : PAGE
  const page = doc.addPage(size)
  const inset = 24
  const scale = Math.min(
    (size[0] - inset * 2) / image.width,
    (size[1] - inset * 2) / image.height,
    1
  )
  const w = image.width * scale
  const h = image.height * scale
  page.drawImage(image, {
    x: (size[0] - w) / 2,
    y: (size[1] - h) / 2,
    width: w,
    height: h,
  })
}

/** Content types the packet can hold. Others go along as separate files. */
export const MERGEABLE_TYPES = ["application/pdf", "image/png", "image/jpeg"]

/**
 * The invoice page followed by each document. Returns the PDF and the files
 * that couldn't be merged in (HEIC and WebP photos, or a damaged PDF), which
 * the email attaches on their own.
 */
export async function buildInvoicePacket(
  data: InvoicePage,
  files: PacketFile[]
) {
  const doc = await PDFDocument.create()
  doc.setTitle(`Invoice ${data.number}`)
  doc.setSubject(`Load ${latin1(data.load.reference)}`)
  doc.setAuthor(latin1(data.from.name))
  doc.setCreator("OfficeTruck")
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  }
  drawInvoicePage(doc, fonts, data)

  const separate: PacketFile[] = []
  for (const file of files) {
    if (!MERGEABLE_TYPES.includes(file.content_type)) {
      separate.push(file)
      continue
    }
    try {
      if (file.content_type === "application/pdf") {
        const source = await PDFDocument.load(file.bytes, {
          ignoreEncryption: true,
        })
        const pages = await doc.copyPages(source, source.getPageIndices())
        for (const page of pages) doc.addPage(page)
      } else {
        await addImagePage(doc, file)
      }
    } catch {
      separate.push(file)
    }
  }

  return { pdf: await doc.save(), separate }
}
