import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuthenticatedStudentFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authStudent = await requireAuthenticatedStudentFromRequest(req);
    const student = await prisma.student.findUnique({
      where: { id: authStudent.id },
      include: { subjects: true },
    });

    if (!student) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    return NextResponse.json({
      studentId: student.id,
      studentName: student.name,
      subjects: student.subjects.map((subject) => ({
        id: subject.id,
        name: subject.name,
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to load student context" }, { status: 500 });
  }
}
