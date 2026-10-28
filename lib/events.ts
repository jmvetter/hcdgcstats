import "server-only";
import { db } from "./db";
import type { EventType } from "./data";

export function setEventType(id: string, type: EventType) {
  db.prepare("UPDATE events SET type = ? WHERE id = ?").run(type, id);
}
