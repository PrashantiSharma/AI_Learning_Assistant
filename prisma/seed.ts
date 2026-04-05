import "../lib/env";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const student = await prisma.student.upsert({
    where: { email: "demo@student.com" },
    update: {},
    create: {
      name: "Demo Student",
      email: "demo@student.com",
      dailyStudyHours: 4,
    },
  });

  const existingSubject = await prisma.subject.findFirst({
    where: {
      studentId: student.id,
      name: { equals: "Mathematics", mode: "insensitive" },
    },
  });

  const subject =
    existingSubject ??
    (await prisma.subject.create({
      data: {
        name: "Mathematics",
        studentId: student.id,
        syllabus:
          "Differentiation, Integration, Probability, Matrices and Trigonometry",
        examPattern: "MCQs, short answers, and problem solving questions",
        examDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    }));

  const topics = [
    {
      name: "Differentiation",
      difficulty: 4,
      completionRatio: 0.35,
      quizAccuracy: 52,
      practiceAttempts: 4,
      revisionCount: 1,
      previousScore: 48,
      lastStudiedDays: 6,
    },
    {
      name: "Integration",
      difficulty: 5,
      completionRatio: 0.20,
      quizAccuracy: 45,
      practiceAttempts: 3,
      revisionCount: 1,
      previousScore: 41,
      lastStudiedDays: 9,
    },
    {
      name: "Probability",
      difficulty: 3,
      completionRatio: 0.60,
      quizAccuracy: 70,
      practiceAttempts: 6,
      revisionCount: 2,
      previousScore: 68,
      lastStudiedDays: 4,
    },
    {
      name: "Matrices",
      difficulty: 2,
      completionRatio: 0.75,
      quizAccuracy: 80,
      practiceAttempts: 5,
      revisionCount: 3,
      previousScore: 77,
      lastStudiedDays: 2,
    }
  ];

  for (const topic of topics) {
    const existingTopic = await prisma.topic.findFirst({
      where: {
        subjectId: subject.id,
        name: { equals: topic.name, mode: "insensitive" },
      },
    });

    if (!existingTopic) {
      await prisma.topic.create({
        data: {
          ...topic,
          subjectId: subject.id,
        },
      });
    }
  }

  await prisma.studyLog.create({
    data: {
      studentId: student.id,
      minutes: 90,
      activity: "Practiced differentiation and probability exercises",
    },
  });

  console.log("Seed completed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
