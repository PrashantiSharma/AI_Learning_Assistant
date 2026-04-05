import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuthSession, setAuthCookie } from "@/lib/auth";
import { hashPassword } from "@/lib/auth-crypto";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export async function POST(req: NextRequest) {
  try {
    const payload = (await req.json()) as {
      name?: string;
      email?: string;
      password?: string;
    };

    const name = String(payload.name ?? "").trim();
    const email = normalizeEmail(String(payload.email ?? ""));
    const password = String(payload.password ?? "");

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "name, email, and password are required" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters long" },
        { status: 400 }
      );
    }

    const existing = await prisma.student.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    const student = await prisma.student.create({
      data: {
        name,
        email,
        passwordHash: hashPassword(password),
        dailyStudyHours: 2,
      },
      select: { id: true, name: true, email: true },
    });

    const { token, expiresAt } = await createAuthSession(student.id);
    const response = NextResponse.json(
      {
        student: {
          id: student.id,
          name: student.name,
          email: student.email,
        },
      },
      { status: 201 }
    );
    setAuthCookie(response, token, expiresAt);
    return response;
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to register" }, { status: 500 });
  }
}
