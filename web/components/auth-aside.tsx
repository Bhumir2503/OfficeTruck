import type { CSSProperties } from "react"

// Every shade derives from --primary, so the panel follows the theme.
const palette = {
  "--sky-top": "color-mix(in oklch, var(--primary) 72%, black)",
  "--sky-bottom": "color-mix(in oklch, var(--primary) 72%, white)",
  "--city-far": "color-mix(in oklch, var(--primary) 90%, white)",
  "--city-near": "color-mix(in oklch, var(--primary) 78%, black)",
  "--ground": "color-mix(in oklch, var(--primary) 42%, black)",
  "--ink": "color-mix(in oklch, var(--primary) 30%, black)",
  "--cream": "var(--primary-foreground)",
  "--cream-shade":
    "color-mix(in oklch, var(--primary-foreground) 82%, var(--primary))",
  "--amber": "#f4b740",
  "--amber-shade": "#d9932a",
  "--box": "#c98f55",
  background: "linear-gradient(to bottom, var(--sky-top), var(--sky-bottom))",
} as CSSProperties

const farBuildings = [
  [40, 560, 90],
  [150, 480, 70],
  [240, 590, 110],
  [370, 520, 80],
  [540, 500, 96],
  [660, 570, 100],
]

const nearBuildings = [
  [-10, 660, 120],
  [130, 610, 90],
  [240, 690, 130],
  [395, 640, 100],
  [515, 680, 110],
  [640, 620, 90],
  [745, 680, 80],
]

function Building({ x, y, width }: { x: number; y: number; width: number }) {
  const columns = Math.floor((width - 16) / 22)
  const rows = Math.floor((880 - y - 20) / 34)
  const inset = (width - (columns * 22 - 10)) / 2

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={880 - y}
        fill="var(--city-near)"
      />
      {Array.from({ length: rows }, (_, row) =>
        Array.from({ length: columns }, (_, column) => {
          const lit = (x + row * 7 + column * 3) % 5 === 0

          return (
            <rect
              key={`${row}-${column}`}
              x={x + inset + column * 22}
              y={y + 16 + row * 34}
              width={12}
              height={18}
              rx={1.5}
              fill={lit ? "var(--amber)" : "var(--sky-top)"}
              opacity={lit ? 0.9 : 0.45}
            />
          )
        })
      )}
    </g>
  )
}

function Wheel({ x }: { x: number }) {
  return (
    <g>
      <circle cx={x} cy={846} r={40} fill="var(--ink)" />
      <circle cx={x} cy={846} r={20} fill="var(--cream-shade)" />
      <circle cx={x} cy={846} r={7} fill="var(--ink)" />
    </g>
  )
}

function Cargo() {
  return (
    <g>
      {/* Filing cabinet */}
      <rect
        x={150}
        y={640}
        width={68}
        height={135}
        rx={4}
        fill="var(--cream)"
      />
      {[648, 691, 734].map((y) => (
        <g key={y}>
          <rect
            x={157}
            y={y}
            width={54}
            height={35}
            rx={2}
            fill="var(--cream-shade)"
          />
          <rect
            x={174}
            y={y + 10}
            width={20}
            height={5}
            rx={2.5}
            fill="var(--ink)"
          />
        </g>
      ))}

      {/* Plant */}
      <path
        d="M183 600c-32-8-46-34-44-62 26 4 42 22 44 62Z"
        fill="var(--amber-shade)"
      />
      <path
        d="M183 600c-12-34-6-68 12-92 16 28 14 64-12 92Z"
        fill="var(--cream-shade)"
      />
      <path
        d="M183 600c6-30 24-48 48-52 0 28-18 50-48 52Z"
        fill="var(--amber)"
      />
      <path d="M164 598h40l-5 42h-30Z" fill="var(--box)" />

      {/* Desk */}
      <rect
        x={232}
        y={692}
        width={172}
        height={13}
        rx={3}
        fill="var(--amber)"
      />
      <rect x={244} y={705} width={10} height={70} fill="var(--amber-shade)" />
      <rect x={336} y={705} width={58} height={70} fill="var(--amber-shade)" />
      <rect x={344} y={716} width={42} height={20} rx={2} fill="var(--amber)" />
      <rect x={344} y={744} width={42} height={20} rx={2} fill="var(--amber)" />

      {/* Monitor and mug */}
      <rect x={264} y={622} width={92} height={56} rx={5} fill="var(--ink)" />
      <rect
        x={270}
        y={628}
        width={80}
        height={44}
        rx={2}
        fill="var(--sky-bottom)"
      />
      <rect x={304} y={678} width={12} height={10} fill="var(--ink)" />
      <rect x={290} y={687} width={40} height={5} rx={2} fill="var(--ink)" />
      <rect x={372} y={670} width={18} height={22} rx={3} fill="var(--cream)" />

      {/* Cardboard box under the desk */}
      <rect x={262} y={730} width={66} height={45} rx={2} fill="var(--box)" />
      <rect
        x={288}
        y={730}
        width={14}
        height={45}
        fill="var(--amber)"
        opacity={0.7}
      />

      {/* Office chair */}
      <rect x={470} y={640} width={22} height={86} rx={10} fill="var(--ink)" />
      <rect x={424} y={718} width={68} height={15} rx={7} fill="var(--ink)" />
      <rect x={452} y={733} width={9} height={26} fill="var(--cream-shade)" />
      <rect
        x={424}
        y={757}
        width={66}
        height={7}
        rx={3.5}
        fill="var(--cream-shade)"
      />
      <circle cx={430} cy={769} r={6} fill="var(--ink)" />
      <circle cx={484} cy={769} r={6} fill="var(--ink)" />
    </g>
  )
}

function Truck() {
  return (
    <g>
      {/* Bed and chassis */}
      <rect
        x={130}
        y={775}
        width={395}
        height={22}
        rx={3}
        fill="var(--cream)"
      />
      <rect x={130} y={797} width={562} height={20} rx={3} fill="var(--ink)" />

      {/* Cab */}
      <path
        d="M535 797V664a14 14 0 0 1 14-14h66a14 14 0 0 1 11 5l46 62 12 6a14 14 0 0 1 8 13v61Z"
        fill="var(--amber)"
      />
      <path d="M556 672h54l37 50h-91Z" fill="var(--sky-top)" />
      <rect
        x={556}
        y={738}
        width={22}
        height={6}
        rx={3}
        fill="var(--amber-shade)"
      />
      <rect x={684} y={752} width={10} height={20} rx={3} fill="var(--cream)" />
      <rect x={520} y={610} width={9} height={165} rx={3} fill="var(--ink)" />

      <Wheel x={228} />
      <Wheel x={420} />
      <Wheel x={610} />
    </g>
  )
}

function City() {
  return (
    <>
      {farBuildings.map(([x, y, width]) => (
        <rect
          key={x}
          x={x}
          y={y}
          width={width}
          height={880 - y}
          fill="var(--city-far)"
        />
      ))}
      {nearBuildings.map(([x, y, width]) => (
        <Building key={x} x={x} y={y} width={width} />
      ))}

      <rect x={-1} y={880} width={802} height={120} fill="var(--ground)" />
      {[20, 180, 340, 500, 660].map((x) => (
        <rect
          key={x}
          x={x}
          y={936}
          width={96}
          height={8}
          rx={4}
          fill="var(--cream-shade)"
          opacity={0.55}
        />
      ))}
    </>
  )
}

function Illustration() {
  return (
    <svg
      aria-hidden
      viewBox="0 300 800 700"
      preserveAspectRatio="xMidYMax meet"
      className="absolute bottom-0 left-0 h-[calc(100%-10rem)] w-full overflow-visible"
    >
      <circle cx={610} cy={470} r={120} fill="var(--amber)" opacity={0.85} />

      {/* The city repeats sideways so wide panels stay filled. */}
      {[-800, 0, 800].map((offset) => (
        <g key={offset} transform={`translate(${offset})`}>
          <City />
        </g>
      ))}

      <Cargo />
      <Truck />
    </svg>
  )
}

export function AuthAside() {
  return (
    <aside className="relative hidden overflow-hidden lg:block" style={palette}>
      <Illustration />
      <p className="absolute top-0 left-0 max-w-md p-10 pr-24 text-4xl leading-tight font-bold tracking-tight text-balance text-primary-foreground xl:text-5xl xl:leading-tight">
        Your office, on the move.
      </p>
    </aside>
  )
}
