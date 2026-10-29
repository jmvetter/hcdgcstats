import { SCORE_BANDS, type ScoreBand, type ScoringBreakdown } from "@/lib/data";

// Diverging scale: blue under par, neutral gray at par, red over par, darker the
// further from par. Validated for colour-blind separation in both modes (see
// the dataviz palette check); the legend always repeats label, count and share,
// so colour never carries the meaning alone.
const BAND_COLOR: Record<ScoreBand, string> = {
  eagle: "bg-[#1c5cab] dark:bg-[#6da7ec]",
  birdie: "bg-[#6da7ec] dark:bg-[#256abf]",
  par: "bg-[#e4e3de] dark:bg-[#34342f]",
  bogey: "bg-[#e36b6a] dark:bg-[#c23a3a]",
  double: "bg-[#a82e2e] dark:bg-[#ee8a89]",
};

const pct = (n: number, total: number) => `${((n / total) * 100).toFixed(1)}%`;

export function ScoringBreakdownBar({ data }: { data: ScoringBreakdown }) {
  if (data.holes === 0) {
    return <p className="text-sm text-zinc-500">No hole-by-hole scores yet.</p>;
  }
  const bands = SCORE_BANDS.filter(({ band }) => data.counts[band] > 0);
  return (
    <figure className="flex flex-col gap-3">
      {/* gap-0.5 = the 2px surface gap between stacked segments */}
      <div
        className="flex h-3 w-full gap-0.5 overflow-hidden rounded"
        role="img"
        aria-label={SCORE_BANDS.map(({ band, label }) => `${label} ${pct(data.counts[band], data.holes)}`).join(", ")}
      >
        {bands.map(({ band, label }) => (
          <div
            key={band}
            className={`${BAND_COLOR[band]} h-full min-w-[3px] transition-opacity hover:opacity-80`}
            style={{ flexGrow: data.counts[band] }}
            title={`${label}: ${data.counts[band]} of ${data.holes} holes (${pct(data.counts[band], data.holes)})`}
          />
        ))}
      </div>
      <figcaption>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-5">
          {SCORE_BANDS.map(({ band, label }) => (
            <div key={band} className="flex items-baseline gap-2">
              <span aria-hidden className={`inline-block size-2.5 shrink-0 rounded-sm ${BAND_COLOR[band]}`} />
              <dt className="text-zinc-600 dark:text-zinc-400">{label}</dt>
              <dd className="ml-auto tabular-nums sm:ml-0">
                <span className="font-semibold">{pct(data.counts[band], data.holes)}</span>{" "}
                <span className="text-zinc-500">({data.counts[band]})</span>
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-zinc-500">Across {data.holes.toLocaleString()} holes played.</p>
      </figcaption>
    </figure>
  );
}
