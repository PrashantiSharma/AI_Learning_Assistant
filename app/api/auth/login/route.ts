import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuthSession, setAuthCookie } from "@/lib/auth";
import { verifyPassword } from "@/lib/auth-crypto";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export async function POST(req: NextRequest) {
  try {
    const payload = (await req.json()) as {
      email?: string;
      password?: string;
    };

    const email = normalizeEmail(String(payload.email ?? ""));
    const password = String(payload.password ?? "");

    if (!email || !password) {
      return NextResponse.json(
        { error: "email and password are required" },
        { status: 400 }
      );
    }

    const student = await prisma.student.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: {
        id: true,
        name: true,
        email: true,
        passwordHash: true,
      },
    });

    if (!student?.passwordHash || !verifyPassword(password, student.passwordHash)) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const { token, expiresAt } = await createAuthSession(student.id);
    const response = NextResponse.json(
      {
        student: {
          id: student.id,
          name: student.name,
          email: student.email,
        },
      },
      { status: 200 }
    );
    setAuthCookie(response, token, expiresAt);
    return response;
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to login" }, { status: 500 });
  }
}
