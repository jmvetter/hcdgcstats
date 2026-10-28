"use client";

import { useRouter } from "next/navigation";

// Division dropdown. Each option carries the link the server built for it, so
// the page's other query parameters (sort, type, members) are kept.
export function DivisionFilter({
  value,
  options,
}: {
  value: string;
  options: { label: string; value: string; href: string }[];
}) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2">
      <span className="text-zinc-500">Division</span>
      <select
        value={value}
        onChange={(e) => {
          const option = options.find((o) => o.value === e.target.value);
          if (option) router.push(option.href, { scroll: false });
        }}
        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
