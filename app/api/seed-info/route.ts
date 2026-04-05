import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const student = await prisma.student.findFirst({
    include: { subjects: true },
  });

  if (!student) {
    return NextResponse.json({ error: "Seed data not found" }, { status: 404 });
  }

  return NextResponse.json({
    studentId: student.id,
    subjects: student.subjects.map((subject) => ({
      id: subject.id,
      name: subject.name,
    })),
  });
}
