import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { predictStudyPlan } from "@/lib/ml-client";
import {
  UploadParseError,
  extractUploadedFileText,
} from "@/lib/upload-text-extractor";
import {
  HfExtractionUnavailableError,
  MAX_WORKFLOW_TOPICS,
  PRIOR_KNOWLEDGE_COMPLETION_MAP,
  WorkflowSubject,
  buildWorkflowDraftTitle,
  createWorkflowSessionId,
  extractSubjectsAndTopicsWithHf,
  isLowQualityAcademicExtractionText,
  normalizePriorKnowledge,
  prepareWorkflowDocumentText,
} from "@/lib/study-plan-workflow";

type JsonObject = Record<string, unknown>;

type TopicInput = {
  subject: string;
  topic: string;
  priorKnowledge: "none" | "low" | "medium" | "high";
  suggestedDifficulty: number;
  importance: number;
};

type PlanPriority = "high" | "medium" | "low";

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonObject;
}

function asArray(value: unknown): JsonObject[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item) => item && typeof item === "object" && !Array.isArray(item)
  ) as JsonObject[];
}

function toSafeLabel(value: unknown, fallback: string) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!text) return fallback;
  return text.slice(0, 120);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function safeId(base: string): string {
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeTopicInputs(rawInputs: unknown): TopicInput[] {
  const items = asArray(rawInputs)
    .map((item, index) => {
      const subject = toSafeLabel(item.subject, "General");
      const topic = toSafeLabel(item.topic ?? item.name, `Topic ${index + 1}`);
      return {
        subject,
        topic,
        priorKnowledge: normalizePriorKnowledge(item.priorKnowledge),
        suggestedDifficulty: clamp(
          Math.round(Number(item.suggestedDifficulty ?? 3) || 3),
          1,
          5
        ),
        importance: clamp(Number(item.importance ?? 0.5) || 0.5, 0, 1),
      } satisfies TopicInput;
    })
    .filter(
      (item, index, arr) =>
        arr.findIndex(
          (entry) =>
            entry.subject.toLowerCase() === item.subject.toLowerCase() &&
            entry.topic.toLowerCase() === item.topic.toLowerCase()
        ) === index
    );

  return items.slice(0, MAX_WORKFLOW_TOPICS);
}

function topicsFromSubjects(subjects: WorkflowSubject[]) {
  return subjects
    .flatMap((subject) =>
      subject.topics.map((topic) => ({
        subject: subject.name,
        topic: topic.name,
        priorKnowledge: "medium" as const,
        suggestedDifficulty: topic.suggestedDifficulty,
        importance: topic.importance,
      }))
    )
    .slice(0, MAX_WORKFLOW_TOPICS);
}

function normalizeTargetScorePercent(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 75;
  return clamp(Math.round(parsed), 30, 100);
}

function priorKnowledgeStrength(value: TopicInput["priorKnowledge"]) {
  if (value === "high") return 0.95;
  if (value === "medium") return 0.7;
  if (value === "low") return 0.4;
  return 0.1;
}

function toPriorityClass(score: number, targetScorePercent: number): PlanPriority {
  if (targetScorePercent >= 85) {
    if (score >= 0.58) return "high";
    return "medium";
  }
  if (targetScorePercent <= 50) {
    if (score >= 0.62) return "high";
    if (score >= 0.42) return "medium";
    return "low";
  }

  if (score >= 0.66) return "high";
  if (score >= 0.4) return "medium";
  return "low";
}

function keyForTopic(subject: string, topic: string) {
  return `${subject.trim().toLowerCase()}::${topic.trim().toLowerCase()}`;
}

function applyTargetScoringStrategy(input: {
  studyPlanRows: JsonObject[];
  topicInputs: TopicInput[];
  targetScorePercent: number;
}) {
  const topicInputByKey = new Map<string, TopicInput>();
  for (const topic of input.topicInputs) {
    topicInputByKey.set(keyForTopic(topic.subject, topic.topic), topic);
  }

  const scored = input.studyPlanRows.map((row) => {
    const subject = toSafeLabel(row.subject, "General");
    const topicName = toSafeLabel(row.topic_name, "Topic");
    const topicInput = topicInputByKey.get(keyForTopic(subject, topicName));
    const baseScore = clamp(Number(row.rule_priority_score ?? 0.5) || 0.5, 0, 1);
    const difficultyScore = clamp((Number(row.topic_difficulty ?? 3) || 3) / 5, 0, 1);
    const strengthScore = priorKnowledgeStrength(
      topicInput?.priorKnowledge ?? "medium"
    );
    const importanceScore = clamp(topicInput?.importance ?? 0.5, 0, 1);

    let adjustedScore = baseScore;
    if (input.targetScorePercent <= 50) {
      adjustedScore =
        baseScore * 0.2 + strengthScore * 0.55 + importanceScore * 0.25;
    } else if (input.targetScorePercent >= 85) {
      adjustedScore =
        baseScore * 0.45 +
        importanceScore * 0.3 +
        difficultyScore * 0.15 +
        (1 - strengthScore) * 0.1;
    } else {
      adjustedScore =
        baseScore * 0.6 + importanceScore * 0.2 + (1 - strengthScore) * 0.2;
    }

    const priority = toPriorityClass(adjustedScore, input.targetScorePercent);
    return {
      ...row,
      subject,
      topic_name: topicName,
      adjusted_priority_score: clamp(adjustedScore, 0, 1),
      predicted_priority_class: priority,
      priority_confidence: clamp(
        Number(row.priority_confidence ?? 0.6) * 0.6 + adjustedScore * 0.4,
        0.45,
        0.99
      ),
      topic_difficulty: clamp(
        Number(row.topic_difficulty ?? 3) || 3,
        1,
        5
      ),
      completed: Boolean(row.completed),
    };
  });

  scored.sort(
    (a, b) =>
      Number(b.adjusted_priority_score ?? 0) - Number(a.adjusted_priority_score ?? 0)
  );

  const totalHours =
    input.targetScorePercent >= 85
      ? 6
      : input.targetScorePercent <= 50
      ? 3
      : 4;
  const scoreSum = scored.reduce(
    (sum, row) => sum + Number(row.adjusted_priority_score ?? 0),
    0
  );

  return scored.map((row, index) => {
    const weight = scoreSum > 0 ? Number(row.adjusted_priority_score ?? 0) / scoreSum : 1 / scored.length;
    return {
      ...row,
      day: `Day ${index + 1}`,
      allocated_hours: Number((Math.max(0.5, totalHours * weight)).toFixed(2)),
      completed: false,
    };
  });
}

async function getDraftSession(studentId: string, sessionId: string) {
  return prisma.studyPlan.findFirst({
    where: {
      studentId,
      title: buildWorkflowDraftTitle(sessionId),
    },
  });
}

function parseDraftContent(contentJson: unknown) {
  const root = asObject(contentJson);
  const meta = asObject(root.meta);
  const workflow = asObject(root.workflow);
  return {
    root,
    meta,
    workflow,
    topicInputs: normalizeTopicInputs(workflow.topicInputs),
    examDate: String(meta.examDate ?? ""),
    examName: toSafeLabel(meta.examName, "General Exam"),
    targetScorePercent: normalizeTargetScorePercent(meta.targetScorePercent),
    syllabusText: String(workflow.syllabusText ?? ""),
    questionPaperText: String(workflow.questionPaperText ?? ""),
  };
}

export async function POST(req: NextRequest) {
  try {
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

    const payload = (await req.json()) as {
      studentId?: string;
      examDate?: string;
      examName?: string;
      targetScorePercent?: number;
      syllabusText?: string;
      questionPaperText?: string;
    };

    const studentId = payload.studentId?.trim() ?? "";
    const examDate = payload.examDate?.trim() ?? "";
    const examName = toSafeLabel(payload.examName, "General Exam");
    const targetScorePercent = normalizeTargetScorePercent(
      payload.targetScorePercent
    );
    const syllabusPrepared = prepareWorkflowDocumentText(payload.syllabusText ?? "");
    const questionPaperPrepared = prepareWorkflowDocumentText(
      payload.questionPaperText ?? ""
    );
    const syllabusText = syllabusPrepared.text;
    const questionPaperText = questionPaperPrepared.text;

    if (!studentId || !examDate) {
      return NextResponse.json(
        { error: "studentId and examDate are required" },
        { status: 400 }
      );
    }

    if (!syllabusText || !questionPaperText) {
      return NextResponse.json(
        { error: "Both syllabus and previous year question paper text are required" },
        { status: 400 }
      );
    }

    if (syllabusText.length < 40 || questionPaperText.length < 40) {
      return NextResponse.json(
        {
          error:
            "Could not extract readable text from one or both uploaded documents. Please paste extracted text manually.",
        },
        { status: 400 }
      );
    }

    if (
      (syllabusPrepared.source === "pdf_binary" &&
        isLowQualityAcademicExtractionText(syllabusText)) ||
      (questionPaperPrepared.source === "pdf_binary" &&
        isLowQualityAcademicExtractionText(questionPaperText))
    ) {
      return NextResponse.json(
        {
          error:
            "Uploaded PDF text appears to be metadata/noise. Please paste extracted syllabus/PYQ text for accurate topic extraction.",
        },
        { status: 400 }
      );
    }

    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    const sessionId = createWorkflowSessionId();
    const hfSessionId = createWorkflowSessionId();
    const extracted = await extractSubjectsAndTopicsWithHf({
      syllabusText,
      questionPaperText,
      examDate,
      examName,
      hfSessionId,
    });

    const topicInputs = topicsFromSubjects(extracted.subjects);
    const contentJson = {
      meta: {
        workflowStatus: "draft",
        step: 1,
        examDate,
        examName,
        targetScorePercent,
        sessionId,
        hfSessionId: extracted.hfSessionId,
        provider: extracted.provider,
        sourceTypes: {
          syllabus: syllabusPrepared.source,
          questionPaper: questionPaperPrepared.source,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      workflow: {
        syllabusText,
        questionPaperText,
        subjects: extracted.subjects,
        topicInputs,
      },
    };

    await prisma.studyPlan.create({
      data: {
        studentId,
        title: buildWorkflowDraftTitle(sessionId),
        planDate: new Date(),
        contentJson: contentJson as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({
      sessionId,
      examDate,
      examName,
      targetScorePercent,
      subjects: extracted.subjects,
      topicInputs,
      provider: extracted.provider,
    });
  } catch (error) {
    console.error(error);
    if (error instanceof UploadParseError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof HfExtractionUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "Failed to extract study plan workflow data" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const payload = (await req.json()) as {
      studentId?: string;
      sessionId?: string;
      topicInputs?: unknown;
    };

    const studentId = payload.studentId?.trim() ?? "";
    const sessionId = payload.sessionId?.trim() ?? "";

    if (!studentId || !sessionId) {
      return NextResponse.json(
        { error: "studentId and sessionId are required" },
        { status: 400 }
      );
    }

    const topicInputs = normalizeTopicInputs(payload.topicInputs);
    if (topicInputs.length === 0) {
      return NextResponse.json(
        { error: `At least one topic is required (max ${MAX_WORKFLOW_TOPICS}).` },
        { status: 400 }
      );
    }

    const draft = await getDraftSession(studentId, sessionId);
    if (!draft) {
      return NextResponse.json({ error: "Workflow session not found" }, { status: 404 });
    }

    const parsed = parseDraftContent(draft.contentJson);
    const nextContent = {
      ...parsed.root,
      meta: {
        ...parsed.meta,
        workflowStatus: "draft",
        step: 2,
        updatedAt: new Date().toISOString(),
      },
      workflow: {
        ...parsed.workflow,
        topicInputs,
      },
    };

    await prisma.studyPlan.update({
      where: { id: draft.id },
      data: {
        contentJson: nextContent as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({
      sessionId,
      topicInputs,
      saved: true,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to save workflow topic calibration" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const payload = (await req.json()) as {
      studentId?: string;
      sessionId?: string;
      topicInputs?: unknown;
    };

    const studentId = payload.studentId?.trim() ?? "";
    const sessionId = payload.sessionId?.trim() ?? "";

    if (!studentId || !sessionId) {
      return NextResponse.json(
        { error: "studentId and sessionId are required" },
        { status: 400 }
      );
    }

    const draft = await getDraftSession(studentId, sessionId);
    if (!draft) {
      return NextResponse.json({ error: "Workflow session not found" }, { status: 404 });
    }

    const parsed = parseDraftContent(draft.contentJson);
    const incomingTopicInputs = normalizeTopicInputs(payload.topicInputs);
    const topicInputs =
      incomingTopicInputs.length > 0 ? incomingTopicInputs : parsed.topicInputs;

    if (topicInputs.length === 0) {
      return NextResponse.json(
        { error: "No calibrated topics found in workflow session." },
        { status: 400 }
      );
    }

    const examDate =
      parsed.examDate && !Number.isNaN(new Date(parsed.examDate).valueOf())
        ? parsed.examDate
        : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const examName = toSafeLabel(parsed.examName, "General Exam");
    const targetScorePercent = normalizeTargetScorePercent(
      parsed.targetScorePercent
    );

    const subjectIdByName = new Map<string, string>();
    for (const topic of topicInputs) {
      const existingSubject = await prisma.subject.findFirst({
        where: {
          studentId,
          name: { equals: topic.subject, mode: "insensitive" },
        },
      });

      const subject =
        existingSubject ??
        (await prisma.subject.create({
          data: {
            studentId,
            name: topic.subject,
            examDate: new Date(examDate),
            syllabus: parsed.syllabusText,
            examPattern: parsed.questionPaperText,
          },
        }));

      if (!subject.examDate) {
        await prisma.subject.update({
          where: { id: subject.id },
          data: { examDate: new Date(examDate) },
        });
      }

      subjectIdByName.set(topic.subject.toLowerCase(), subject.id);

      const completionRatio = PRIOR_KNOWLEDGE_COMPLETION_MAP[topic.priorKnowledge];
      const existingTopic = await prisma.topic.findFirst({
        where: {
          subjectId: subject.id,
          name: { equals: topic.topic, mode: "insensitive" },
        },
      });

      if (!existingTopic) {
        await prisma.topic.create({
          data: {
            subjectId: subject.id,
            name: topic.topic,
            difficulty: topic.suggestedDifficulty,
            completionRatio,
            quizAccuracy: Math.round(completionRatio * 100),
            revisionCount:
              topic.priorKnowledge === "high"
                ? 3
                : topic.priorKnowledge === "medium"
                ? 2
                : 0,
            practiceAttempts:
              topic.priorKnowledge === "high"
                ? 5
                : topic.priorKnowledge === "medium"
                ? 3
                : topic.priorKnowledge === "low"
                ? 1
                : 0,
            previousScore: Math.round(completionRatio * 100),
            lastStudiedDays:
              topic.priorKnowledge === "none"
                ? 14
                : topic.priorKnowledge === "low"
                ? 10
                : topic.priorKnowledge === "medium"
                ? 6
                : 3,
          },
        });
      } else {
        await prisma.topic.update({
          where: { id: existingTopic.id },
          data: {
            difficulty: topic.suggestedDifficulty,
            completionRatio,
            quizAccuracy: Math.round(completionRatio * 100),
            revisionCount:
              topic.priorKnowledge === "high"
                ? 3
                : topic.priorKnowledge === "medium"
                  ? 2
                  : 0,
            practiceAttempts:
              topic.priorKnowledge === "high"
                ? 5
                : topic.priorKnowledge === "medium"
                  ? 3
                  : topic.priorKnowledge === "low"
                    ? 1
                    : 0,
            previousScore: Math.round(completionRatio * 100),
            lastStudiedDays:
              topic.priorKnowledge === "none"
                ? 14
                : topic.priorKnowledge === "low"
                  ? 10
                  : topic.priorKnowledge === "medium"
                    ? 6
                    : 3,
          },
        });
      }
    }

    const rows = topicInputs.map((topic) => {
      const completionRatio = PRIOR_KNOWLEDGE_COMPLETION_MAP[topic.priorKnowledge];
      return {
        student_id: studentId,
        subject: topic.subject,
        topic_name: topic.topic,
        topic_difficulty: topic.suggestedDifficulty,
        exam_date: new Date(examDate).toISOString(),
        current_date: new Date().toISOString(),
        study_time_minutes: 60,
        quiz_accuracy: Math.round(completionRatio * 100),
        practice_attempts:
          topic.priorKnowledge === "high"
            ? 5
            : topic.priorKnowledge === "medium"
            ? 3
            : topic.priorKnowledge === "low"
            ? 1
            : 0,
        revision_count:
          topic.priorKnowledge === "high"
            ? 3
            : topic.priorKnowledge === "medium"
            ? 2
            : 0,
        last_studied_days_ago:
          topic.priorKnowledge === "none"
            ? 14
            : topic.priorKnowledge === "low"
            ? 10
            : topic.priorKnowledge === "medium"
            ? 6
            : 3,
        completion_ratio: completionRatio,
        previous_score: Math.round(completionRatio * 100),
        syllabus_text: parsed.syllabusText,
        exam_pattern_text: parsed.questionPaperText,
        material_text: `${topic.topic} weighted importance score ${topic.importance.toFixed(
          2
        )}`,
      };
    });

    const prediction = await predictStudyPlan(rows);
    const predictions = asArray(asObject(prediction).predictions);
    const studyPlanRows = asArray(asObject(prediction).study_plan).map(
      (row, index) => {
        const subject = toSafeLabel(row.subject, "General");
        const topicName = toSafeLabel(row.topic_name, `Topic ${index + 1}`);
        const day = `Day ${index + 1}`;
        return {
          id: `${safeId(`${subject}-${topicName}-${day}`)}-${index}`,
          topic_name: topicName,
          subject,
          predicted_priority_class:
            String(row.predicted_priority_class ?? "medium").toLowerCase() === "high"
              ? "high"
              : String(row.predicted_priority_class ?? "medium").toLowerCase() ===
                "low"
              ? "low"
              : "medium",
          priority_confidence: clamp(
            Number(row.priority_confidence ?? 0.6) || 0.6,
            0,
            1
          ),
          allocated_hours: Number(row.allocated_hours ?? 1) || 1,
          rule_priority_score: Number(row.rule_priority_score ?? 0.5) || 0.5,
          quiz_accuracy: Number(row.quiz_accuracy ?? 50) || 50,
          completion_ratio: Number(row.completion_ratio ?? 0) || 0,
          days_until_exam: Number(row.days_until_exam ?? 0) || 0,
          topic_difficulty:
            topicInputs.find(
              (item) =>
                item.subject.toLowerCase() === subject.toLowerCase() &&
                item.topic.toLowerCase() === topicName.toLowerCase()
            )?.suggestedDifficulty ?? 3,
          day,
          completed: false,
        };
      }
    );
    const adjustedStudyPlanRows = applyTargetScoringStrategy({
      studyPlanRows,
      topicInputs,
      targetScorePercent,
    });

    const finalPlan = await prisma.studyPlan.create({
      data: {
        studentId,
        title: `${examName} Study Plan (${new Date().toLocaleDateString("en-US")})`,
        planDate: new Date(),
        contentJson: {
          predictions,
          study_plan: adjustedStudyPlanRows,
          meta: {
            workflowStatus: "finalized",
            workflowSessionId: sessionId,
            hfSessionId: parsed.meta.hfSessionId ?? null,
            generatedAt: new Date().toISOString(),
            examDate,
            examName,
            targetScorePercent,
            subjectIds: [...new Set([...subjectIdByName.values()])],
          },
          workflow: {
            topicInputs,
            provider: parsed.meta.provider ?? "unknown",
            syllabusText: parsed.syllabusText,
            questionPaperText: parsed.questionPaperText,
          },
        } as Prisma.InputJsonValue,
      },
    });

    await prisma.studyPlan.update({
      where: { id: draft.id },
      data: {
        contentJson: {
          ...parsed.root,
          meta: {
            ...parsed.meta,
            workflowStatus: "finalized",
            step: 3,
            finalizedPlanId: finalPlan.id,
            updatedAt: new Date().toISOString(),
          },
          workflow: {
            ...parsed.workflow,
            topicInputs,
          },
        } as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({
      planId: finalPlan.id,
      title: finalPlan.title,
      planDate: finalPlan.planDate,
      examName,
      targetScorePercent,
      predictions,
      study_plan: adjustedStudyPlanRows,
      workflow_session_id: sessionId,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to finalize workflow and generate study plan" },
      { status: 500 }
    );
  }
}
