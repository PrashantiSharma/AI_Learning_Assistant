import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file");

  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  return NextResponse.json({
    message: "File received. Plug PDF extraction or object storage here in production.",
    filename: typeof file === "object" && "name" in file ? file.name : "unknown",
  });
}
