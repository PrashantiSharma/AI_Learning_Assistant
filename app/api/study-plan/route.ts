import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { predictStudyPlan } from "@/lib/ml-client";
import { WORKFLOW_DRAFT_TITLE_PREFIX } from "@/lib/study-plan-workflow";
import { AuthError, requireAuthenticatedStudentFromRequest } from "@/lib/auth";
import {
  UploadParseError,
  extractUploadedFileText,
} from "@/lib/upload-text-extractor";

type JsonObject = Record<string, unknown>;

type StoredPlanItem = {
  id: string;
  topic_name: string;
  subject: string;
  predicted_priority_class: "high" | "medium" | "low";
  priority_confidence: number;
  allocated_hours: number;
  rule_priority_score: number;
  quiz_accuracy: number;
  completion_ratio: number;
  days_until_exam: number;
  topic_difficulty: number;
  day: string;
  completed: boolean;
};

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as JsonObject;
}

function asArray(value: unknown): JsonObject[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item) => item && typeof item === "object" && !Array.isArray(item)
  ) as JsonObject[];
}

function toNumber(value: unknown, fallback: number): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function normalizePriority(value: unknown): "high" | "medium" | "low" {
  const normalized = String(value ?? "medium").toLowerCase();
  if (normalized === "high") return "high";
  if (normalized === "low") return "low";
  return "medium";
}

function safeId(base: string): string {
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeStoredPayload(payload: unknown): {
  predictions: JsonObject[];
  studyPlan: StoredPlanItem[];
  raw: JsonObject;
} {
  const raw = asObject(payload);
  const predictions = asArray(raw.predictions);

  const candidatePlan =
    asArray(raw.study_plan).length > 0
      ? asArray(raw.study_plan)
      : asArray(raw.daily_plan).length > 0
      ? asArray(raw.daily_plan)
      : asArray(raw.plan).length > 0
      ? asArray(raw.plan)
      : predictions;

  const predictionByKey = new Map<string, JsonObject>();
  for (const pred of predictions) {
    const subject = String(pred.subject ?? "General");
    const topicName = String(pred.topic_name ?? pred.topic ?? pred.name ?? "");
    if (!topicName) continue;
    predictionByKey.set(`${subject}::${topicName}`, pred);
    predictionByKey.set(topicName, pred);
  }

  const studyPlan = candidatePlan.map((item, index) => {
    const subject = String(item.subject ?? item.subject_name ?? "General");
    const topicName = String(
      item.topic_name ?? item.topic ?? item.name ?? `Topic ${index + 1}`
    );
    const pred =
      predictionByKey.get(`${subject}::${topicName}`) ??
      predictionByKey.get(topicName) ??
      {};

    const day = String(item.day ?? item.date ?? `Day ${index + 1}`);
    const itemId =
      typeof item.id === "string" && item.id.trim()
        ? item.id
        : `${safeId(`${subject}-${topicName}-${day}`)}-${index}`;

    return {
      id: itemId,
      topic_name: topicName,
      subject,
      predicted_priority_class: normalizePriority(
        item.predicted_priority_class ?? item.predicted_priority ?? item.priority
      ),
      priority_confidence: toNumber(
        item.priority_confidence ?? pred.priority_confidence,
        0.7
      ),
      allocated_hours: toNumber(item.allocated_hours ?? pred.allocated_hours, 1),
      rule_priority_score: toNumber(
        item.rule_priority_score ?? pred.rule_priority_score,
        0.5
      ),
      quiz_accuracy: toNumber(item.quiz_accuracy ?? pred.quiz_accuracy, 50),
      completion_ratio: toNumber(
        item.completion_ratio ?? pred.completion_ratio,
        0
      ),
      days_until_exam: toNumber(
        item.days_until_exam ?? pred.days_until_exam,
        0
      ),
      topic_difficulty: toNumber(
        item.topic_difficulty ?? pred.topic_difficulty ?? item.difficulty,
        3
      ),
      day,
      completed: Boolean(item.completed),
    } satisfies StoredPlanItem;
  });

  return { predictions, studyPlan, raw };
}

function serializePlanRecord(plan: {
  id: string;
  title: string;
  planDate: Date;
  contentJson: unknown;
}) {
  const normalized = normalizeStoredPayload(plan.contentJson);

  return {
    planId: plan.id,
    title: plan.title,
    planDate: plan.planDate,
    ...normalized.raw,
    predictions: normalized.predictions,
    study_plan: normalized.studyPlan,
  };
}

async function resolveSubjects(studentId: string, subjectId?: string) {
  if (subjectId) {
    const subject = await prisma.subject.findFirst({
      where: { id: subjectId, studentId },
      include: { topics: true },
    });
    return subject ? [subject] : [];
  }

  const subjects = await prisma.subject.findMany({
    where: { studentId },
    include: { topics: true },
    orderBy: { createdAt: "asc" },
  });

  const mergedByName = new Map<
    string,
    (typeof subjects)[number] & { topics: (typeof subjects)[number]["topics"] }
  >();

  for (const subject of subjects) {
    const key = subject.name.trim().toLowerCase();
    const current = mergedByName.get(key);
    if (!current) {
      mergedByName.set(key, { ...subject, topics: [...subject.topics] });
      continue;
    }

    const existingTopicNames = new Set(
      current.topics.map((topic) => topic.name.trim().toLowerCase())
    );
    for (const topic of subject.topics) {
      const topicKey = topic.name.trim().toLowerCase();
      if (!existingTopicNames.has(topicKey)) {
        current.topics.push(topic);
        existingTopicNames.add(topicKey);
      }
    }
  }

  return [...mergedByName.values()];
}

async function createAndStorePlan(input: {
  studentId: string;
  subjectId?: string;
  previousPlanItems?: StoredPlanItem[];
}) {
  const subjects = await resolveSubjects(input.studentId, input.subjectId);
  if (subjects.length === 0) {
    return {
      error: "Subject not found for student",
      status: 404 as const,
    };
  }

  const subjectsWithTopics = subjects.filter((subject) => subject.topics.length > 0);
  if (subjectsWithTopics.length === 0) {
    return {
      error: "No topics found for selected subjects. Add topics first.",
      status: 400 as const,
    };
  }

  const rows = subjectsWithTopics.flatMap((subject) =>
    subject.topics.map((topic) => ({
      student_id: input.studentId,
      subject: subject.name,
      topic_name: topic.name,
      topic_difficulty: topic.difficulty ?? 3,
      exam_date: subject.examDate?.toISOString() ?? new Date().toISOString(),
      current_date: new Date().toISOString(),
      study_time_minutes: 60,
      quiz_accuracy: topic.quizAccuracy ?? 50,
      practice_attempts: topic.practiceAttempts ?? 0,
      revision_count: topic.revisionCount ?? 0,
      last_studied_days_ago: topic.lastStudiedDays ?? 7,
      completion_ratio: topic.completionRatio ?? 0,
      previous_score: topic.previousScore ?? 50,
      syllabus_text: subject.syllabus ?? "",
      exam_pattern_text: subject.examPattern ?? "",
      material_text: `${topic.name} practice notes and examples`,
    }))
  );

  const prediction = await predictStudyPlan(rows);
  const normalized = normalizeStoredPayload(prediction);

  const previousCompletion = new Map<string, boolean>();
  for (const item of input.previousPlanItems ?? []) {
    previousCompletion.set(`${item.subject}::${item.topic_name}`, item.completed);
  }

  const mergedStudyPlan = normalized.studyPlan.map((item) => ({
    ...item,
    completed:
      previousCompletion.get(`${item.subject}::${item.topic_name}`) ?? false,
  }));

  const contentJson = {
    ...normalized.raw,
    predictions: normalized.predictions,
    study_plan: mergedStudyPlan,
    meta: {
      subjectIds: subjectsWithTopics.map((subject) => subject.id),
      generatedAt: new Date().toISOString(),
    },
  };

  const planTitle =
    subjectsWithTopics.length === 1
      ? `${subjectsWithTopics[0].name} Personalized Study Plan`
      : `Multi-subject Personalized Study Plan (${subjectsWithTopics.length} subjects)`;

  const created = await prisma.studyPlan.create({
    data: {
      studentId: input.studentId,
      title: planTitle,
      planDate: new Date(),
      contentJson: contentJson as Prisma.InputJsonValue,
    },
  });

  return {
    status: 200 as const,
    data: serializePlanRecord({
      id: created.id,
      title: created.title,
      planDate: created.planDate,
      contentJson,
    }),
  };
}

export async function GET(req: NextRequest) {
  try {
    const authStudent = await requireAuthenticatedStudentFromRequest(req);
    const { searchParams } = new URL(req.url);
    const studentId = authStudent.id;
    const subjectId = searchParams.get("subjectId")?.trim() ?? undefined;
    const autoGenerate =
      searchParams.get("autoGenerate") === "true" ||
      searchParams.get("autoGenerate") === "1";

    const latest = await prisma.studyPlan.findFirst({
      where: {
        studentId,
        NOT: {
          title: { startsWith: `${WORKFLOW_DRAFT_TITLE_PREFIX}:` },
        },
      },
      orderBy: [{ planDate: "desc" }, { createdAt: "desc" }],
    });

    if (latest) {
      return NextResponse.json(serializePlanRecord(latest));
    }

    if (!autoGenerate) {
      return NextResponse.json(
        { error: "No study plan found for student" },
        { status: 404 }
      );
    }

    const generated = await createAndStorePlan({ studentId, subjectId });
    if ("error" in generated) {
      return NextResponse.json(
        { error: generated.error },
        { status: generated.status }
      );
    }

    return NextResponse.json(generated.data);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json(
      { error: "Failed to load study plan" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const authStudent = await requireAuthenticatedStudentFromRequest(req);
    const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
    const isMultipart = contentType.includes("multipart/form-data");
    const mode = new URL(req.url).searchParams.get("mode");

    if (isMultipart || mode === "upload") {
      const formData = await req.formData();
      const file = formData.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
      }
      const result = await extractUploadedFileText(file);
      return NextResponse.json(result);
    }

    const payload = (await req.json()) as { subjectId?: string };
    const studentId = authStudent.id;
    const subjectId = payload.subjectId?.trim() || undefined;

    const latest = await prisma.studyPlan.findFirst({
      where: {
        studentId,
        NOT: {
          title: { startsWith: `${WORKFLOW_DRAFT_TITLE_PREFIX}:` },
        },
      },
      orderBy: [{ planDate: "desc" }, { createdAt: "desc" }],
    });

    const previousItems = latest
      ? normalizeStoredPayload(latest.contentJson).studyPlan
      : [];

    const generated = await createAndStorePlan({
      studentId,
      subjectId,
      previousPlanItems: previousItems,
    });

    if ("error" in generated) {
      return NextResponse.json(
        { error: generated.error },
        { status: generated.status }
      );
    }

    return NextResponse.json(generated.data);
  } catch (error) {
    console.error(error);
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof UploadParseError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "Failed to generate study plan" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authStudent = await requireAuthenticatedStudentFromRequest(req);
    const payload = (await req.json()) as {
      itemId?: string;
      completed?: boolean;
    };

    const studentId = authStudent.id;
    const itemId = payload.itemId?.trim() ?? "";
    const completed = Boolean(payload.completed);

    if (!itemId) {
      return NextResponse.json(
        { error: "itemId is required" },
        { status: 400 }
      );
    }

    const latest = await prisma.studyPlan.findFirst({
      where: {
        studentId,
        NOT: {
          title: { startsWith: `${WORKFLOW_DRAFT_TITLE_PREFIX}:` },
        },
      },
      orderBy: [{ planDate: "desc" }, { createdAt: "desc" }],
    });

    if (!latest) {
      return NextResponse.json(
        { error: "No study plan found for student" },
        { status: 404 }
      );
    }

    const normalized = normalizeStoredPayload(latest.contentJson);
    const itemIndex = normalized.studyPlan.findIndex((item) => item.id === itemId);

    if (itemIndex === -1) {
      return NextResponse.json({ error: "Plan item not found" }, { status: 404 });
    }

    normalized.studyPlan[itemIndex] = {
      ...normalized.studyPlan[itemIndex],
      completed,
    };
    const updatedItem = normalized.studyPlan[itemIndex];
    const matchingTopicItems = normalized.studyPlan.filter(
      (item) =>
        item.subject === updatedItem.subject &&
        item.topic_name === updatedItem.topic_name
    );
    const topicCompletionRatio =
      matchingTopicItems.length > 0
        ? matchingTopicItems.filter((item) => item.completed).length /
          matchingTopicItems.length
        : 0;
    const planMeta = asObject(normalized.raw.meta);
    const subjectIdFromMeta =
      typeof planMeta.subjectId === "string" && planMeta.subjectId.trim()
        ? planMeta.subjectId
        : undefined;

    const nextContent = {
      ...normalized.raw,
      predictions: normalized.predictions,
      study_plan: normalized.studyPlan,
      meta: {
        ...asObject(normalized.raw.meta),
        updatedAt: new Date().toISOString(),
      },
    };

    const updated = await prisma.$transaction(async (tx) => {
      const updatedPlan = await tx.studyPlan.update({
        where: { id: latest.id },
        data: {
          contentJson: nextContent as Prisma.InputJsonValue,
        },
      });

      const matchedSubjectId =
        subjectIdFromMeta ??
        (
          await tx.subject.findFirst({
            where: { studentId, name: updatedItem.subject },
            select: { id: true },
          })
        )?.id;

      if (matchedSubjectId) {
        await tx.topic.updateMany({
          where: {
            subjectId: matchedSubjectId,
            name: updatedItem.topic_name,
          },
          data: {
            completionRatio: topicCompletionRatio,
          },
        });
      }

      return updatedPlan;
    });

    return NextResponse.json({
      planId: updated.id,
      study_plan: normalized.studyPlan,
      topic_completion_ratio: topicCompletionRatio,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json(
      { error: "Failed to update study plan item" },
      { status: 500 }
    );
  }
}
