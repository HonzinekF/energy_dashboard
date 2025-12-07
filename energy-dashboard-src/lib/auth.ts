import { createHash, timingSafeEqual, pbkdf2Sync, randomBytes } from "crypto";
import { cookies } from "next/headers";

const SESSION_COOKIE = "solax-session";
const SESSION_VALUE = "ok";
const PASSWORD = process.env.DASHBOARD_PASSWORD ?? "solax";
const PASSWORD_HASH = process.env.DASHBOARD_PASSWORD_HASH;
const PASSWORD_PBKDF2 = process.env.DASHBOARD_PASSWORD_PBKDF2;

export async function isAuthenticated() {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value === SESSION_VALUE;
}

export function validatePassword(pass: string) {
  if (!pass) {
    return false;
  }

  if (PASSWORD_PBKDF2) {
    return verifyPbkdf2(pass, PASSWORD_PBKDF2);
  }

  if (PASSWORD_HASH) {
    return safeCompare(hashPassword(pass), PASSWORD_HASH);
  }

  return safeCompare(pass, PASSWORD);
}

export async function createSession() {
  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE,
    value: SESSION_VALUE,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 12,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE,
    value: "",
    maxAge: 0,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

function hashPassword(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeCompare(input: string, expected: string) {
  const inputBuffer = Buffer.from(input);
  const expectedBuffer = Buffer.from(expected);
  if (inputBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(inputBuffer, expectedBuffer);
}

function verifyPbkdf2(pass: string, stored: string) {
  const parts = stored.split(":");
  if (parts.length !== 3) return false;
  const [iterationsStr, saltHex, hashHex] = parts;
  const iterations = Number(iterationsStr);
  if (!Number.isFinite(iterations) || iterations <= 0) {
    return false;
  }
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = pbkdf2Sync(pass, salt, iterations, expected.length, "sha512");
  return timingSafeEqual(derived, expected);
}

// helper pro vytvoření hash (není exportováno kvůli bezpečnosti)
export function createPbkdf2Hash(pass: string, iterations = 120000, length = 32) {
  const salt = randomBytes(16);
  const derived = pbkdf2Sync(pass, salt, iterations, length, "sha512");
  return `${iterations}:${salt.toString("hex")}:${derived.toString("hex")}`;
}
