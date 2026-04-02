export async function askAssistant(prompt: string, context: Record<string, unknown>) {
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  const model = process.env.HUGGINGFACE_MODEL || "meta-llama/Meta-Llama-3-8B-Instruct";

  if (!apiKey) {
    return `Assistant is not configured yet. Here is a safe fallback response.\n\nQuestion: ${prompt}\n\nBased on the available student context, focus first on topics with low quiz accuracy, low completion ratio, and high exam importance.`;
  }

  const systemPrompt = `You are an AI learning assistant for students.
Help with study planning, topic prioritization, time management, and exam preparation.
Use the provided student context. Be specific, structured, and concise.`;

  const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Student context: ${JSON.stringify(context)}\n\nQuestion: ${prompt}`,
        },
      ],
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Assistant request failed: ${text}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "No response generated.";
}
