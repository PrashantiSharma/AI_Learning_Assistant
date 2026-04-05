import crypto from "node:crypto";

const PASSWORD_ALGO = "sha512";
const PASSWORD_ITERATIONS = 120_000;
const PASSWORD_KEY_LENGTH = 64;

export function hashSessionToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEY_LENGTH, PASSWORD_ALGO)
    .toString("hex");
  return `pbkdf2$${PASSWORD_ALGO}$${PASSWORD_ITERATIONS}$${salt}$${hash}`;
}

export function verifyPassword(password: string, passwordHash: string) {
  const parts = passwordHash.split("$");
  if (parts.length !== 5 || parts[0] !== "pbkdf2") return false;
  const [, algo, iterationText, salt, expected] = parts;
  const iterations = Number(iterationText);
  if (!Number.isFinite(iterations) || !salt || !expected) return false;

  const actual = crypto
    .pbkdf2Sync(password, salt, iterations, expected.length / 2, algo)
    .toString("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}
