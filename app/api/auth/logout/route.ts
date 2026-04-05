import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth-constants";
import { clearAuthCookie, deleteAuthSessionByToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value?.trim();
  if (token) {
    await deleteAuthSessionByToken(token).catch(() => undefined);
  }

  const response = NextResponse.json({ ok: true });
  clearAuthCookie(response);
  return response;
}
