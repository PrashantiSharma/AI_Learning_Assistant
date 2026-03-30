import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const subjects = await prisma.subject.findMany({
    include: { topics: true, student: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(subjects);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const subject = await prisma.subject.create({ data: body });
  return NextResponse.json(subject, { status: 201 });
}
