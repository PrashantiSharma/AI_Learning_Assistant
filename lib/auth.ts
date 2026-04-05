import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AUTH_COOKIE_NAME, AUTH_SESSION_TTL_DAYS } from "@/lib/auth-constants";
import { createSessionToken, hashSessionToken } from "@/lib/auth-crypto";

export class AuthError extends Error {
  status: number;

  constructor(message = "Unauthorized", status = 401) {
    super(message);
    this.status = status;
  }
}

function getSessionExpiryDate() {
  return new Date(Date.now() + AUTH_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export function setAuthCookie(
  response: NextResponse,
  token: string,
  expiresAt: Date
) {
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export function clearAuthCookie(response: NextResponse) {
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
}

export async function createAuthSession(studentId: string) {
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = getSessionExpiryDate();

  await prisma.authSession.create({
    data: {
      studentId,
      tokenHash,
      expiresAt,
    },
  });

  return { token, expiresAt };
}

export async function deleteAuthSessionByToken(token: string) {
  const tokenHash = hashSessionToken(token);
  await prisma.authSession.deleteMany({ where: { tokenHash } });
}

async function resolveStudentFromSessionToken(token: string) {
  const tokenHash = hashSessionToken(token);
  const session = await prisma.authSession.findUnique({
    where: { tokenHash },
    include: { student: true },
  });

  if (!session) return null;
  if (session.expiresAt <= new Date()) {
    await prisma.authSession.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  return session.student;
}

export async function getAuthenticatedStudentFromRequest(req: NextRequest) {
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value?.trim();
  if (!token) return null;
  return resolveStudentFromSessionToken(token);
}

export async function requireAuthenticatedStudentFromRequest(req: NextRequest) {
  const student = await getAuthenticatedStudentFromRequest(req);
  if (!student) {
    throw new AuthError("Authentication required", 401);
  }
  return student;
}

export async function getAuthenticatedStudentFromCookieStore() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value?.trim();
  if (!token) return null;
  return resolveStudentFromSessionToken(token);
}

export async function requireAuthenticatedStudentForPage() {
  const student = await getAuthenticatedStudentFromCookieStore();
  if (!student) {
    redirect("/login");
  }
  return student;
}
