/**
 * Supabase (PostgREST) returns at most 1,000 rows per request, and drops the
 * rest without an error. These read a whole result in pages, so lists and
 * totals don't quietly stop at 1,000 rows as a company's history grows.
 */

/** Rows per request: the server's cap. */
export const PAGE_ROWS = 1000

type Result<T> = { data: T[] | null; error: { message: string } | null }

/**
 * Every row of a query, read PAGE_ROWS at a time. `page` builds the query for
 * one range of rows; it must be ordered on something unique (end the order
 * with the id), or rows can repeat or go missing between pages.
 */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<Result<T>>
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await page(from, from + PAGE_ROWS - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_ROWS) return rows
  }
}

/** IDs per `.in()` filter, so a request's URL stays well under size limits. */
export const ID_CHUNK = 150

/**
 * A query filtered by a list of ids, run in chunks of ID_CHUNK (each read
 * whole with fetchAll, all at once), with the results joined in order. For
 * lists of ids that grow with the company, like every load it has run.
 */
export async function fetchByIds<T>(
  ids: readonly string[],
  page: (chunk: string[], from: number, to: number) => PromiseLike<Result<T>>
): Promise<T[]> {
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    chunks.push(ids.slice(i, i + ID_CHUNK))
  }
  const results = await Promise.all(
    chunks.map((chunk) => fetchAll((from, to) => page(chunk, from, to)))
  )
  return results.flat()
}
