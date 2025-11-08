import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const workflowInstances = new Map();

function generateWorkflowId() {
  return `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function evaluateCondition(condition, aggregatedData) {
  if (!condition) return true;
  
  const fieldValue = aggregatedData[condition.field];
  
  if (condition.equals !== undefined) {
    return fieldValue === condition.equals;
  }
  
  if (condition.in !== undefined) {
    return condition.in.includes(fieldValue);
  }
  
  if (condition.exists !== undefined) {
    return condition.exists ? fieldValue !== undefined : fieldValue === undefined;
  }
  
  return true;
}

function getNextStep(workflow, currentStepId, aggregatedData) {
  const currentIndex = workflow.steps.findIndex(s => s.id === currentStepId);
  
  for (let i = currentIndex + 1; i < workflow.steps.length; i++) {
    const step = workflow.steps[i];
    if (evaluateCondition(step.when, aggregatedData)) {
      return step;
    }
  }
  
  return null;
}

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

function buildSystemPrompt(formConfig, aggregatedData = null) {
  if (formConfig.mode === "html-scraping") {
    const editableFields = Object.keys(formConfig.editableFields || {}).join(", ");
    return `
You are an assistant that helps users update player records in a football club admin system.

Available fields you can update: ${editableFields}

Rules:
- When a user wants to update a player, extract:
  1. The player's name (target_name)
  2. The field to update (field) - must be one of: ${editableFields}
  3. The new value (value)
- Use the update_player tool to perform the update.
- Be conversational and confirm what you're about to update.
- If the user's request is unclear, ask for clarification.
    `.trim();
  }

  const allFields = getAllFields(formConfig);
  const fields = Object.entries(allFields)
    .map(([key, f]) => `- ${key} (${f.label || key}) ${f.required ? '[required]' : ''}`)
    .join("\n");

  let contextSection = '';
  if (aggregatedData && Object.keys(aggregatedData).length > 0) {
    const contextItems = Object.entries(aggregatedData)
      .map(([key, value]) => `- ${key}: ${value}`)
      .join("\n");
    contextSection = `\n\nPreviously collected information:\n${contextItems}\n\nYou can reference this information naturally in your conversation.`;
  }

  return `
You are an assistant that helps users fill out a form.

Form name: ${formConfig.name}
Description: ${formConfig.description || ''}

Fields:
${fields}
${contextSection}

Rules:
- Ask for missing required fields one at a time in a conversational way.
- Confirm unclear answers.
- When you have ALL required fields, respond with a tool call to submit_form.
- Be friendly and conversational.
  `.trim();
}

app.post("/workflow/start", async (req, res) => {
  try {
    const { siteKey, workflow } = req.body;

    if (!siteKey || !workflow) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const workflowId = generateWorkflowId();
    const firstStep = workflow.steps.find(s => evaluateCondition(s.when, {}));

    if (!firstStep) {
      return res.status(400).json({ error: "No valid first step found" });
    }

    workflowInstances.set(workflowId, {
      workflow,
      aggregatedData: {},
      currentStepId: firstStep.id,
      stepHistory: []
    });

    return res.json({
      workflowId,
      currentStep: firstStep,
      aggregatedData: {}
    });
  } catch (error) {
    console.error("Error starting workflow:", error);
    return res.status(500).json({ 
      error: "Internal server error",
      message: error.message 
    });
  }
});

app.post("/llm", async (req, res) => {
  try {
    const { siteKey, formConfig, messages, workflowId, stepId, aggregatedData } = req.body;

    if (!siteKey || !formConfig || !messages) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const systemPrompt = buildSystemPrompt(formConfig, aggregatedData);

    const userConversation = messages.filter(m => m.role !== "system");

    let tools;
    if (formConfig.mode === "html-scraping") {
      tools = [
        {
          type: "function",
          function: {
            name: "update_player",
            description: "Update a player's information in the system",
            parameters: {
              type: "object",
              properties: {
                target_name: {
                  type: "string",
                  description: "The full name of the player to update"
                },
                field: {
                  type: "string",
                  description: "The field to update",
                  enum: Object.keys(formConfig.editableFields || {})
                },
                value: {
                  type: "string",
                  description: "The new value for the field"
                }
              },
              required: ["target_name", "field", "value"]
            }
          }
        }
      ];
    } else {
      tools = [
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
      ];
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...userConversation
      ],
      tools,
      tool_choice: "auto"
    });

    const choice = completion.choices[0];
    const msg = choice.message;

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      const toolCall = msg.tool_calls[0];
      const collected = JSON.parse(toolCall.function.arguments);

      if (toolCall.function.name === "update_player") {
        return res.json({
          reply: `I found ${collected.target_name}. Updating their ${collected.field} now.`,
          status: "action",
          action: {
            type: "update_player_html",
            target_name: collected.target_name,
            field: collected.field,
            value: collected.value
          }
        });
      }

      if (workflowId && stepId) {
        const instance = workflowInstances.get(workflowId);
        if (instance) {
          Object.keys(collected).forEach(key => {
            instance.aggregatedData[`${stepId}.${key}`] = collected[key];
          });

          const nextStep = getNextStep(instance.workflow, stepId, instance.aggregatedData);

          if (nextStep) {
            instance.currentStepId = nextStep.id;
            instance.stepHistory.push(stepId);

            return res.json({
              reply: "Great! Let's move to the next step.",
              status: "complete_step",
              collected,
              nextStep,
              aggregatedData: instance.aggregatedData
            });
          } else {
            return res.json({
              reply: "Perfect! I have all the information needed.",
              status: "complete_workflow",
              collected,
              aggregatedData: instance.aggregatedData,
              submitTo: instance.workflow.finalSubmit.submitTo
            });
          }
        }
      }

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

app.post("/admin/players/:id", (req, res) => {
  console.log(`Player ${req.params.id} updated:`, req.body);
  res.json({ success: true, message: "Player updated successfully" });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AI form agent backend running on port ${PORT}`);
});
