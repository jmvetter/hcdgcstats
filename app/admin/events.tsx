"use client";

import type { ClubEvent } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { setEventTypeAction } from "./actions";

// Lists imported events with their type. Changing the type takes effect as
// soon as it's picked: League counts each round as a finish, Tournament counts
// the final place.
export function EventList({ events }: { events: ClubEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-zinc-500">No events imported yet.</p>;
  return (
    <div className="max-h-96 overflow-auto rounded-md border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-zinc-50 text-zinc-500 dark:bg-zinc-900">
          <tr>
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Event</th>
            <th className="w-40 px-3 py-2 font-medium">Type</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
          {events.map((e) => (
            <tr key={`${e.id}|${e.type}`}>
              <td className="whitespace-nowrap px-3 py-2">{formatDate(e.date)}</td>
              <td className="px-3 py-2">{e.name}</td>
              <td className="px-3 py-2">
                <form action={setEventTypeAction}>
                  <input type="hidden" name="id" value={e.id} />
                  <select
                    name="type"
                    defaultValue={e.type}
                    onChange={(ev) => ev.currentTarget.form?.requestSubmit()}
                    aria-label={`Type for ${e.name}`}
                    className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <option value="League">League</option>
                    <option value="Tournament">Tournament</option>
                    <option value="Doubles">Doubles</option>
                  </select>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
