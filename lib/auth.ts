import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// A single shared admin password (ADMIN_PASSWORD). The cookie holds an HMAC of a
// fixed string keyed by the password, so changing the password logs everyone out.
const COOKIE = "hcdgc_admin";

function token(): string | null {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return null;
  return createHmac("sha256", pw).update("hcdgc-admin").digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function adminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

export async function isAdmin(): Promise<boolean> {
  const expected = token();
  const actual = (await cookies()).get(COOKIE)?.value;
  return Boolean(expected && actual && safeEqual(actual, expected));
}

export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) throw new Error("Unauthorized");
}

export async function logIn(password: string): Promise<boolean> {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw || !safeEqual(password, pw)) return false;
  (await cookies()).set(COOKIE, token()!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return true;
}

export async function logOut(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
