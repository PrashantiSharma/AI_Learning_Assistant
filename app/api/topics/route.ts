import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const topics = await prisma.topic.findMany({
    include: { subject: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(topics);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const topic = await prisma.topic.create({ data: body });
  return NextResponse.json(topic, { status: 201 });
}
