import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  fetchAll,
  fetchByIds,
  ID_CHUNK,
  PAGE_ROWS,
} from "@/lib/supabase/paging"

// A table of `n` rows read like PostgREST: a range, capped at PAGE_ROWS.
function table(n) {
  const rows = Array.from({ length: n }, (_, i) => ({ i }))
  const calls = []
  const page = async (from, to) => {
    calls.push([from, to])
    return {
      data: rows.slice(from, Math.min(to + 1, from + PAGE_ROWS)),
      error: null,
    }
  }
  return { page, calls }
}

describe("fetchAll", () => {
  it("reads past the 1,000-row cap", async () => {
    const { page, calls } = table(2345)
    const rows = await fetchAll(page)
    assert.equal(rows.length, 2345)
    assert.equal(rows.at(-1).i, 2344)
    assert.equal(calls.length, 3)
  })

  it("asks once more after an exactly full page", async () => {
    const { page, calls } = table(PAGE_ROWS)
    assert.equal((await fetchAll(page)).length, PAGE_ROWS)
    assert.equal(calls.length, 2)
  })

  it("handles an empty result", async () => {
    const { page } = table(0)
    assert.deepEqual(await fetchAll(page), [])
  })

  it("throws the query's error", async () => {
    const error = { message: "boom" }
    await assert.rejects(
      fetchAll(async () => ({ data: null, error })),
      error
    )
  })
})

describe("fetchByIds", () => {
  it("splits the ids into chunks and joins the results", async () => {
    const ids = Array.from({ length: ID_CHUNK * 2 + 5 }, (_, i) => `id${i}`)
    const chunks = []
    const rows = await fetchByIds(ids, async (chunk) => {
      chunks.push(chunk.length)
      return { data: chunk.map((id) => ({ id })), error: null }
    })
    assert.deepEqual(chunks, [ID_CHUNK, ID_CHUNK, 5])
    assert.deepEqual(
      rows.map((row) => row.id),
      ids
    )
  })

  it("makes no request for no ids", async () => {
    let called = false
    const rows = await fetchByIds([], async () => {
      called = true
      return { data: [], error: null }
    })
    assert.deepEqual(rows, [])
    assert.equal(called, false)
  })
})
