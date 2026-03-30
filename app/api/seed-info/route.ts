import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const student = await prisma.student.findFirst({
    include: { subjects: true },
  });

  if (!student || student.subjects.length === 0) {
    return NextResponse.json({ error: "Seed data not found" }, { status: 404 });
  }

  return NextResponse.json({
    studentId: student.id,
    subjectId: student.subjects[0].id,
  });
}
