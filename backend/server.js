import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function getAllFields(formConfig) {
  if (formConfig.fields) {
    return formConfig.fields;
  }
  
  if (formConfig.sections) {
    const allFields = {};
    formConfig.sections.forEach(section => {
      Object.assign(allFields, section.fields);
    });
    return allFields;
  }
  
  return {};
}

function buildSystemPrompt(formConfig) {
  const allFields = getAllFields(formConfig);
  const fields = Object.entries(allFields)
    .map(([key, f]) => `- ${key} (${f.label || key}) ${f.required ? '[required]' : ''}`)
    .join("\n");

  return `
You are an assistant that helps users fill out a form.

Form name: ${formConfig.name}
Description: ${formConfig.description || ''}

Fields:
${fields}

Rules:
- Ask for missing required fields one at a time in a conversational way.
- Confirm unclear answers.
- When you have ALL required fields, respond with a tool call to submit_form.
- Be friendly and conversational.
  `.trim();
}

app.post("/llm", async (req, res) => {
  try {
    const { siteKey, formConfig, messages } = req.body;

    if (!siteKey || !formConfig || !messages) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const systemPrompt = buildSystemPrompt(formConfig);

    const userConversation = messages.filter(m => m.role !== "system");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...userConversation
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "submit_form",
            description: "Collect final form values when all required fields are gathered",
            parameters: {
              type: "object",
              properties: Object.fromEntries(
                Object.entries(getAllFields(formConfig)).map(([key, f]) => [
                  key,
                  { type: "string", description: f.label || key }
                ])
              ),
              required: Object.entries(getAllFields(formConfig))
                .filter(([_, f]) => f.required)
                .map(([key]) => key)
            }
          }
        }
      ],
      tool_choice: "auto"
    });

    const choice = completion.choices[0];
    const msg = choice.message;

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      const toolCall = msg.tool_calls[0];
      const collected = JSON.parse(toolCall.function.arguments);

      return res.json({
        reply: "Great, I'll submit that now.",
        status: "complete",
        collected,
        submitTo: formConfig.form.submitTo
      });
    }

    return res.json({
      reply: msg.content || "Can you tell me that again?",
      status: "incomplete",
      collected: {}
    });
  } catch (error) {
    console.error("Error processing request:", error);
    return res.status(500).json({ 
      error: "Internal server error",
      message: error.message 
    });
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AI form agent backend running on port ${PORT}`);
});
