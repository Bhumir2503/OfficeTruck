import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { filterDocuments } from "../lib/company-document-format.ts"

const entry = (overrides) => ({
  key: "k",
  group: "load",
  type: "POD",
  file_name: "pod.pdf",
  owner: "TQL-1042",
  path: "loads/l1",
  date: "2026-11-10",
  url: null,
  ...overrides,
})

describe("filterDocuments", () => {
  const entries = [
    entry({ key: "a" }),
    entry({ key: "b", type: "BOL", owner: "CLB-40977" }),
    entry({ key: "c", group: "driver", type: "CDL", owner: "Ana Torres", file_name: "Ana Torres CDL" }),
  ]

  it("matches every word across type, file and owner", () => {
    assert.deepEqual(filterDocuments(entries, "all", "pod tql").map((e) => e.key), ["a"])
    assert.deepEqual(filterDocuments(entries, "all", "ana").map((e) => e.key), ["c"])
  })

  it("filters by group", () => {
    assert.deepEqual(filterDocuments(entries, "driver", "").map((e) => e.key), ["c"])
    assert.equal(filterDocuments(entries, "all", "").length, 3)
  })
})
