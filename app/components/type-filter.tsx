import Link from "next/link";
import type { EventType } from "@/lib/data";

// All / Leagues / Tournaments switch. `href` builds the link for each choice so
// each page can keep its other query parameters.
export function TypeFilter({ type, href }: { type?: EventType; href: (t: EventType | null) => string }) {
  const options: [EventType | null, string][] = [
    [null, "All"],
    ["League", "Leagues"],
    ["Tournament", "Tournaments"],
    ["Doubles", "Doubles"],
  ];
  return (
    <nav aria-label="Event type" className="inline-flex rounded-full border border-zinc-200 p-0.5 dark:border-zinc-800">
      {options.map(([t, label]) => {
        const active = (t ?? undefined) === type;
        return (
          <Link
            key={label}
            href={href(t)}
            scroll={false}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-3 py-1 ${
              active ? "bg-black text-white dark:bg-white dark:text-black" : "text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
