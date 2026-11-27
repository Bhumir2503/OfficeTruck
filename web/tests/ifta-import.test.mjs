import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  combineMiles,
  fuelKey,
  guessColumns,
  mergeFuel,
  parseCsv,
  readDate,
  readFuelRows,
  readJurisdiction,
  readMilesRows,
  readNumber,
} from "../lib/ifta-import.ts"

const Q4 = { year: 2026, quarter: 4 }
const TRUCKS = [
  { id: "t1", name: "T-101" },
  { id: "t2", name: "102" },
]

describe("parseCsv", () => {
  it("reads quotes, commas and line breaks inside quotes", () => {
    assert.deepEqual(
      parseCsv(
        '﻿Unit,State,Miles\r\nT-101,TX,"1,240"\r\n"T-1""02",OK,"5\n0"\n\n'
      ),
      [
        ["Unit", "State", "Miles"],
        ["T-101", "TX", "1,240"],
        ['T-1"02', "OK", "5\n0"],
      ]
    )
  })

  it("reads semicolon and tab files", () => {
    assert.deepEqual(parseCsv("a;b\n1;2"), [
      ["a", "b"],
      ["1", "2"],
    ])
    assert.deepEqual(parseCsv("a\tb\n1\t2"), [
      ["a", "b"],
      ["1", "2"],
    ])
  })
})

describe("guessColumns", () => {
  it("matches a Motive-style mileage report", () => {
    assert.deepEqual(
      guessColumns(
        ["Vehicle", "Jurisdiction", "Distance (mi)", "Notes"],
        "miles"
      ),
      { truck: 0, jurisdiction: 1, miles: 2 }
    )
  })

  it("matches a fuel card export, and doesn't take one column twice", () => {
    assert.deepEqual(
      guessColumns(
        [
          "Transaction Date",
          "Unit",
          "Merchant Name",
          "Merchant State",
          "Qty",
          "Total Amount",
        ],
        "fuel"
      ),
      { date: 0, truck: 1, jurisdiction: 3, gallons: 4, amount: 5, vendor: 2 }
    )
  })

  it("leaves a field out when nothing fits", () => {
    assert.equal(guessColumns(["State", "Miles"], "miles").truck, null)
  })
})

describe("values", () => {
  it("reads states by code or name, and refuses non-IFTA ones", () => {
    assert.equal(readJurisdiction("tx"), "TX")
    assert.equal(readJurisdiction("New Mexico"), "NM")
    assert.equal(readJurisdiction("Ontario (ON)"), "ON")
    assert.equal(readJurisdiction("AK"), null)
    assert.equal(readJurisdiction(""), null)
  })

  it("reads numbers with $ and commas", () => {
    assert.equal(readNumber("$1,512.40"), 1512.4)
    assert.equal(readNumber("12a"), null)
  })

  it("reads US and ISO dates, and refuses impossible ones", () => {
    assert.equal(readDate("11/7/2026"), "2026-11-07")
    assert.equal(readDate("11/07/26 14:02"), "2026-11-07")
    assert.equal(readDate("2026-11-07T10:00:00Z"), "2026-11-07")
    assert.equal(readDate("02/30/2026"), null)
    assert.equal(readDate("Nov 7"), null)
  })
})

describe("readMilesRows", () => {
  const rows = parseCsv(
    'Unit,State,Miles\nT-101,TX,"1,240"\n#102,Oklahoma,300\nT-999,TX,5\nT-101,AK,10\nT-101,KS,0'
  )
  const map = guessColumns(rows[0], "miles")

  it("matches trucks by unit and says why a row can't be used", () => {
    const lines = readMilesRows(rows, map, TRUCKS, null)
    assert.deepEqual(
      lines.map((line) => line.problem),
      [
        null,
        null,
        "No truck numbered T-999",
        "AK isn't an IFTA state or province",
        "0 miles",
      ]
    )
    assert.deepEqual(lines[1].row, {
      truck_id: "t2",
      jurisdiction: "OK",
      miles: 300,
    })
    assert.equal(lines[0].line, 2)
  })

  it("uses the chosen truck when no column names one", () => {
    const noTruck = parseCsv("State,Miles\nTX,10")
    const lines = readMilesRows(
      noTruck,
      guessColumns(noTruck[0], "miles"),
      TRUCKS,
      "t2"
    )
    assert.deepEqual(lines[0].row, {
      truck_id: "t2",
      jurisdiction: "TX",
      miles: 10,
    })
    assert.equal(
      readMilesRows(noTruck, guessColumns(noTruck[0], "miles"), TRUCKS, null)[0]
        .problem,
      "Choose the truck"
    )
  })

  it("adds up a state's miles across lines", () => {
    assert.deepEqual(
      combineMiles([
        { truck_id: "t1", jurisdiction: "TX", miles: 100 },
        { truck_id: "t1", jurisdiction: "TX", miles: 50 },
        { truck_id: "t2", jurisdiction: "TX", miles: 7 },
      ]),
      [
        { truck_id: "t1", jurisdiction: "TX", miles: 150 },
        { truck_id: "t2", jurisdiction: "TX", miles: 7 },
      ]
    )
  })
})

describe("readFuelRows", () => {
  it("reads purchases and leaves out ones from other quarters", () => {
    const rows = parseCsv(
      "Date,Unit,State,Gallons,Amount,Merchant\n11/02/2026,T-101,TX,112.5,$420.10,Pilot Amarillo\n09/30/2026,T-101,TX,50,,\n11/03/2026,T-101,OK,,,"
    )
    const lines = readFuelRows(
      rows,
      guessColumns(rows[0], "fuel"),
      TRUCKS,
      null,
      Q4
    )
    assert.deepEqual(lines[0].row, {
      truck_id: "t1",
      purchased_on: "2026-11-02",
      jurisdiction: "TX",
      gallons: 112.5,
      amount: 420.1,
      vendor: "Pilot Amarillo",
    })
    assert.equal(lines[1].problem, "Not in Q4 2026")
    assert.equal(lines[2].problem, "No gallons")
  })

  it("keys a purchase the same however its gallons are written", () => {
    const row = {
      truck_id: "t1",
      purchased_on: "2026-11-02",
      jurisdiction: "TX",
    }
    assert.equal(
      fuelKey({ ...row, gallons: 112.5 }),
      fuelKey({ ...row, gallons: "112.500" })
    )
  })
})

describe("mergeFuel", () => {
  it("counts a purchase on a load and on the IFTA page once, newest first", () => {
    const base = { truck_id: "t1", jurisdiction: "TX", amount: null }
    const merged = mergeFuel(
      [
        { ...base, id: "a", purchased_on: "2026-11-02", gallons: "112.500" },
        { ...base, id: "b", purchased_on: "2026-11-09", gallons: "50.000" },
      ],
      [
        {
          ...base,
          id: "e",
          purchased_on: "2026-11-02",
          gallons: 112.5,
          load: { id: "l1", reference: "12345" },
        },
      ]
    )
    assert.deepEqual(
      merged.map((row) => [row.id, row.gallons, row.load?.reference ?? null]),
      [
        ["b", 50, null],
        ["e", 112.5, "12345"],
      ]
    )
  })
})
