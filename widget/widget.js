(async function () {
  const scriptEl = document.currentScript;
  const configUrl = scriptEl.getAttribute("data-config");
  const workflowUrl = scriptEl.getAttribute("data-workflow");
  const siteKey = scriptEl.getAttribute("data-site-key");
  const mountEl = document.getElementById("ai-agent");

  if (!mountEl) {
    console.error("AI Agent: Mount element #ai-agent not found");
    return;
  }

  if (!configUrl && !workflowUrl) {
    console.error("AI Agent: Either data-config or data-workflow attribute is required");
    return;
  }

  if (!siteKey) {
    console.error("AI Agent: data-site-key attribute is required");
    return;
  }

  const backendUrl = scriptEl.getAttribute("data-backend-url") || "http://localhost:3000";
  const isWorkflow = !!workflowUrl;
  
  let formConfig;
  let workflow;
  let workflowId;
  let currentStep;
  let aggregatedData = {};
  let stepHistory = [];

  if (isWorkflow) {
    try {
      workflow = await fetch(workflowUrl, { credentials: "include" }).then(r => r.json());
      
      const startRes = await fetch(`${backendUrl}/workflow/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteKey, workflow })
      }).then(r => r.json());

      workflowId = startRes.workflowId;
      currentStep = startRes.currentStep;
      aggregatedData = startRes.aggregatedData;

      formConfig = await fetch(currentStep.config, { credentials: "include" }).then(r => r.json());
    } catch (error) {
      console.error("AI Agent: Failed to load workflow", error);
      mountEl.innerHTML = '<div style="color:red;padding:12px;">Failed to load workflow configuration</div>';
      return;
    }
  } else {
    try {
      formConfig = await fetch(configUrl, { credentials: "include" }).then(r => r.json());
    } catch (error) {
      console.error("AI Agent: Failed to load config", error);
      mountEl.innerHTML = '<div style="color:red;padding:12px;">Failed to load form configuration</div>';
      return;
    }
  }

  mountEl.innerHTML = `
    <div id="ai-agent-container" style="position:fixed;bottom:20px;right:20px;z-index:9999;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,Cantarell,sans-serif;">
      <div id="ai-agent-toggle" style="width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.15);font-size:28px;">
        💬
      </div>
      <div id="ai-agent-box" style="display:none;position:absolute;bottom:80px;right:0;width:380px;height:500px;background:#fff;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.15);flex-direction:column;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:16px;display:flex;flex-direction:column;gap:8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="font-weight:600;font-size:16px;">AI Assistant</div>
            <div id="ai-agent-close" style="cursor:pointer;font-size:20px;line-height:1;">×</div>
          </div>
          <div id="ai-progress" style="display:none;font-size:12px;opacity:0.9;"></div>
        </div>
        <div id="ai-messages" style="flex:1;overflow-y:auto;padding:16px;background:#f8f9fa;"></div>
        <div style="padding:16px;background:#fff;border-top:1px solid #e9ecef;">
          <div style="display:flex;gap:8px;">
            <input id="ai-input" style="flex:1;padding:10px 12px;border:1px solid #dee2e6;border-radius:8px;font-size:14px;outline:none;" placeholder="Type your message..." />
            <button id="ai-send" style="padding:10px 20px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;border:none;border-radius:8px;cursor:pointer;font-weight:500;font-size:14px;">Send</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const messagesEl = document.getElementById("ai-messages");
  const inputEl = document.getElementById("ai-input");
  const sendBtn = document.getElementById("ai-send");
  const toggleBtn = document.getElementById("ai-agent-toggle");
  const closeBtn = document.getElementById("ai-agent-close");
  const chatBox = document.getElementById("ai-agent-box");
  const progressEl = document.getElementById("ai-progress");

  let conversation = [
    { role: "system", content: "You are a form-filling assistant." }
  ];

  function updateProgress() {
    if (isWorkflow && workflow) {
      const currentIndex = workflow.steps.findIndex(s => s.id === currentStep.id);
      const totalSteps = workflow.steps.length;
      progressEl.textContent = `Step ${currentIndex + 1} of ${totalSteps}: ${currentStep.title || currentStep.id}`;
      progressEl.style.display = "block";
    }
  }

  toggleBtn.addEventListener("click", () => {
    if (chatBox.style.display === "none") {
      chatBox.style.display = "flex";
      toggleBtn.style.display = "none";
    }
  });

  closeBtn.addEventListener("click", () => {
    chatBox.style.display = "none";
    toggleBtn.style.display = "flex";
  });

  function addMessage(role, text) {
    const div = document.createElement("div");
    div.style.marginBottom = "12px";
    div.style.padding = "10px 14px";
    div.style.borderRadius = "12px";
    div.style.maxWidth = "85%";
    div.style.fontSize = "14px";
    div.style.lineHeight = "1.4";
    
    if (role === "assistant") {
      div.style.background = "#fff";
      div.style.border = "1px solid #e9ecef";
      div.style.marginRight = "auto";
      div.textContent = text;
    } else {
      div.style.background = "linear-gradient(135deg,#667eea 0%,#764ba2 100%)";
      div.style.color = "white";
      div.style.marginLeft = "auto";
      div.textContent = text;
    }
    
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  updateProgress();
  addMessage("assistant", formConfig.ui?.greeting || "Hi! I can help you fill this form.");

  async function loadNextStep(nextStep) {
    try {
      currentStep = nextStep;
      formConfig = await fetch(nextStep.config, { credentials: "include" }).then(r => r.json());
      
      conversation = [
        { role: "system", content: "You are a form-filling assistant." }
      ];
      
      updateProgress();
      addMessage("assistant", formConfig.ui?.greeting || "Let's continue with the next section.");
    } catch (error) {
      console.error("AI Agent: Failed to load next step config", error);
      addMessage("assistant", "Sorry, I had trouble loading the next step. Please refresh the page.");
    }
  }

  async function findPlayerByName(name, config) {
    const task = config.tasks.list_players;
    const html = await fetch(task.url, { credentials: "include" }).then(r => r.text());
    const doc = new DOMParser().parseFromString(html, "text/html");
    const rows = doc.querySelectorAll(task.tableSelector);

    name = name.toLowerCase();
    let match = null;

    rows.forEach(row => {
      const playerName = row.querySelector(task.columns.name).textContent.trim().toLowerCase();
      if (playerName === name && !match) {
        const editLink = row.querySelector(task.columns.edit_url);
        match = {
          name: playerName,
          editUrl: editLink.getAttribute("href"),
          squad_number: row.querySelector(task.columns.squad_number).textContent.trim(),
          position: row.querySelector(task.columns.position).textContent.trim(),
          dob: row.querySelector(task.columns.dob).textContent.trim()
        };
      }
    });

    return match;
  }

  async function createPlayerHtml(data, config) {
    const newFormUrl = config.tasks.new_player_form.url;
    const html = await fetch(newFormUrl, { credentials: "include" }).then(r => r.text());
    const doc = new DOMParser().parseFromString(html, "text/html");

    const form = doc.querySelector(config.tasks.new_player_form.formSelector);
    if (!form) {
      throw new Error("New player form not found");
    }

    let action = form.getAttribute("action") || config.tasks.create_player_form.url;
    const method = (form.getAttribute("method") || "POST").toUpperCase();

    const formData = new FormData();
    
    form.querySelectorAll("input[type='hidden']").forEach(el => {
      if (el.name) {
        formData.append(el.name, el.value);
      }
    });

    Object.keys(data).forEach(logicalField => {
      const realFieldName = config.editableFields[logicalField];
      if (realFieldName) {
        formData.set(realFieldName, data[logicalField]);
      }
    });

    try {
      const actionUrl = new URL(action, window.location.origin);
      action = `${backendUrl}${actionUrl.pathname}`;
    } catch (e) {
      console.warn("Could not parse action URL, using as-is:", action);
    }

    const resp = await fetch(action, {
      method,
      body: formData
    });

    return resp.ok;
  }

  async function updatePlayerHtml(editUrl, logicalField, newValue, config) {
    const html = await fetch(editUrl, { credentials: "include" }).then(r => r.text());
    const doc = new DOMParser().parseFromString(html, "text/html");

    const form = doc.querySelector(config.tasks.edit_player_form.formSelector);
    if (!form) {
      throw new Error("Form not found on edit page");
    }

    let action = form.getAttribute("action") || editUrl;
    const method = (form.getAttribute("method") || "POST").toUpperCase();

    const formData = new FormData();
    form.querySelectorAll("input, select, textarea").forEach(el => {
      if (!el.name) return;
      if (el.tagName === "SELECT") {
        formData.append(el.name, el.value);
      } else if (el.type === "checkbox" || el.type === "radio") {
        if (el.checked) formData.append(el.name, el.value);
      } else {
        formData.append(el.name, el.value);
      }
    });

    const realFieldName = config.editableFields[logicalField];
    if (realFieldName) {
      formData.set(realFieldName, newValue);
    }

    try {
      const actionUrl = new URL(action, window.location.origin);
      action = `${backendUrl}${actionUrl.pathname}`;
    } catch (e) {
      console.warn("Could not parse action URL, using as-is:", action);
    }

    const resp = await fetch(action, {
      method,
      body: formData
    });

    return resp.ok;
  }

  async function sendToBackend(userText) {
    try {
      const payload = {
        siteKey,
        formConfig,
        messages: [
          ...conversation,
          { role: "user", content: userText }
        ]
      };

      if (isWorkflow) {
        payload.workflowId = workflowId;
        payload.stepId = currentStep.id;
        payload.aggregatedData = aggregatedData;
      }

      const res = await fetch(`${backendUrl}/llm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).then(r => r.json());

      return res;
    } catch (error) {
      console.error("AI Agent: Backend request failed", error);
      return {
        reply: "Sorry, I'm having trouble connecting to the server. Please try again.",
        status: "error",
        collected: {}
      };
    }
  }

  async function handleSend() {
    const userText = inputEl.value.trim();
    if (!userText) return;
    
    addMessage("user", userText);
    inputEl.value = "";
    sendBtn.disabled = true;
    sendBtn.textContent = "...";

    const res = await sendToBackend(userText);

    sendBtn.disabled = false;
    sendBtn.textContent = "Send";

    if (res.status === "error") {
      addMessage("assistant", res.reply);
      return;
    }

    addMessage("assistant", res.reply);
    conversation.push({ role: "user", content: userText });
    conversation.push({ role: "assistant", content: res.reply });

    if (res.status === "action" && res.action) {
      if (res.action.type === "create_player_html") {
        try {
          sendBtn.disabled = true;
          sendBtn.textContent = "...";
          
          const success = await createPlayerHtml(res.action.data, formConfig);
          
          if (success) {
            addMessage("assistant", `✅ Successfully created new player: ${res.action.data.name}!`);
          } else {
            addMessage("assistant", `I had trouble creating the player record. Please try again.`);
          }
          
          sendBtn.disabled = false;
          sendBtn.textContent = "Send";
        } catch (error) {
          console.error("AI Agent: Create player action failed", error);
          addMessage("assistant", `Sorry, I encountered an error while creating the player: ${error.message}`);
          sendBtn.disabled = false;
          sendBtn.textContent = "Send";
        }
      } else if (res.action.type === "update_player_html") {
        try {
          sendBtn.disabled = true;
          sendBtn.textContent = "...";
          
          const player = await findPlayerByName(res.action.target_name, formConfig);
          
          if (!player) {
            addMessage("assistant", `I couldn't find a player named "${res.action.target_name}". Please check the name and try again.`);
            sendBtn.disabled = false;
            sendBtn.textContent = "Send";
            return;
          }
          
          const success = await updatePlayerHtml(
            player.editUrl,
            res.action.field,
            res.action.value,
            formConfig
          );
          
          if (success) {
            addMessage("assistant", `✅ Successfully updated ${res.action.target_name}'s ${res.action.field} to "${res.action.value}"!`);
          } else {
            addMessage("assistant", `I had trouble updating the player record. Please try again.`);
          }
          
          sendBtn.disabled = false;
          sendBtn.textContent = "Send";
        } catch (error) {
          console.error("AI Agent: HTML scraping action failed", error);
          addMessage("assistant", `Sorry, I encountered an error while updating the player: ${error.message}`);
          sendBtn.disabled = false;
          sendBtn.textContent = "Send";
        }
      }
    }else if (res.status === "complete_step") {
      aggregatedData = res.aggregatedData;
      stepHistory.push(currentStep.id);
      
      setTimeout(async () => {
        await loadNextStep(res.nextStep);
      }, 1000);
    } else if (res.status === "complete_workflow") {
      aggregatedData = res.aggregatedData;
      
      const submitUrl = res.submitTo || workflow.finalSubmit.submitTo;
      try {
        const csrfToken = document
          .querySelector('meta[name="csrf-token"]')
          ?.getAttribute("content");

        const submitRes = await fetch(submitUrl, {
          method: workflow.finalSubmit.method || "POST",
          headers: {
            "Content-Type": "application/json",
            ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {})
          },
          credentials: "include",
          body: JSON.stringify(aggregatedData)
        });

        if (submitRes.ok) {
          addMessage("assistant", "All done! ✅");
          inputEl.disabled = true;
          sendBtn.disabled = true;
        } else {
          addMessage("assistant", "I tried to submit but the server returned an error.");
        }
      } catch (e) {
        console.error("AI Agent: Workflow submission failed", e);
        addMessage("assistant", "I couldn't submit the workflow. Please try again.");
      }
    } else if (res.status === "complete") {
      const submitUrl = res.submitTo || formConfig.form.submitTo;
      try {
        const csrfToken = document
          .querySelector('meta[name="csrf-token"]')
          ?.getAttribute("content");

        const submitRes = await fetch(submitUrl, {
          method: formConfig.form.method || "POST",
          headers: {
            "Content-Type": "application/json",
            ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {})
          },
          credentials: "include",
          body: JSON.stringify(res.collected)
        });

        if (submitRes.ok) {
          addMessage("assistant", "All done! ✅");
          inputEl.disabled = true;
          sendBtn.disabled = true;
        } else {
          addMessage("assistant", "I tried to submit but the server returned an error.");
        }
      } catch (e) {
        console.error("AI Agent: Form submission failed", e);
        addMessage("assistant", "I couldn't submit the form. Please try again.");
      }
    }
  }

  sendBtn.addEventListener("click", handleSend);
  inputEl.addEventListener("keydown", e => {
    if (e.key === "Enter") handleSend();
  });
})();
