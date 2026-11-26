import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  bareAddress,
  inboxAddress,
  isRateConFile,
  rateConSender,
  tokenFromRecipients,
} from "../lib/rate-con-inbox-format.ts"

describe("inbox addresses", () => {
  it("builds and finds the company token", () => {
    const address = inboxAddress("ab12cd34ef56", "inbox.officetruck.io")
    assert.equal(address, "rc-ab12cd34ef56@inbox.officetruck.io")
    assert.equal(
      tokenFromRecipients([
        "dispatch@acme.com",
        `Acme Rate Cons <${address.toUpperCase()}>`,
      ]),
      "ab12cd34ef56"
    )
    assert.equal(tokenFromRecipients(["rc-short@x.io", "someone@x.io"]), null)
  })

  it("reads bare addresses", () => {
    assert.equal(bareAddress('"Jen Ortiz" <Jen@TQL.com>'), "jen@tql.com")
    assert.equal(bareAddress("jen@tql.com"), "jen@tql.com")
    assert.equal(bareAddress("no address"), null)
  })
})

describe("isRateConFile", () => {
  it("takes PDFs and real photos, not signature logos", () => {
    assert.equal(
      isRateConFile({ filename: "RC.pdf", content_type: "application/pdf" }),
      true
    )
    assert.equal(
      isRateConFile({
        filename: "scan.jpg",
        content_type: "image/jpeg",
        size: 400_000,
      }),
      true
    )
    assert.equal(
      isRateConFile({
        filename: "logo.png",
        content_type: "image/png",
        size: 8_000,
      }),
      false
    )
    assert.equal(
      isRateConFile({
        filename: "photo.png",
        content_type: "image/png",
        size: 400_000,
        content_disposition: "inline",
      }),
      false
    )
    assert.equal(
      isRateConFile({
        filename: "terms.docx",
        content_type: "application/msword",
      }),
      false
    )
    assert.equal(
      isRateConFile({
        filename: "huge.pdf",
        content_type: "application/pdf",
        size: 30_000_000,
      }),
      false
    )
  })
})

describe("rateConSender", () => {
  const own = ["dispatch@acme.com", "owner@acme.com"]

  it("is the email's sender when a broker sent it straight", () => {
    assert.equal(rateConSender("Jen <jen@tql.com>", null, own), "jen@tql.com")
  })

  it("finds the broker behind a forward from someone at the company", () => {
    const text = [
      "FYI, new load",
      "",
      "---------- Forwarded message ---------",
      "From: Jen Ortiz <jen@tql.com>",
      "Date: Tue, Dec 1, 2026",
      "Subject: Rate confirmation 8824118",
    ].join("\n")
    assert.equal(
      rateConSender("Dispatch <dispatch@acme.com>", text, own),
      "jen@tql.com"
    )
  })

  it("keeps the forwarder when no other sender is in the text", () => {
    assert.equal(
      rateConSender("dispatch@acme.com", "see attached", own),
      "dispatch@acme.com"
    )
  })
})
