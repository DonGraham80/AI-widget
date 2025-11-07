(async function () {
  const scriptEl = document.currentScript;
  const configUrl = scriptEl.getAttribute("data-config");
  const siteKey = scriptEl.getAttribute("data-site-key");
  const mountEl = document.getElementById("ai-agent");

  if (!mountEl) {
    console.error("AI Agent: Mount element #ai-agent not found");
    return;
  }

  if (!configUrl) {
    console.error("AI Agent: data-config attribute is required");
    return;
  }

  if (!siteKey) {
    console.error("AI Agent: data-site-key attribute is required");
    return;
  }

  let formConfig;
  try {
    formConfig = await fetch(configUrl, { credentials: "include" }).then(r => r.json());
  } catch (error) {
    console.error("AI Agent: Failed to load config", error);
    mountEl.innerHTML = '<div style="color:red;padding:12px;">Failed to load form configuration</div>';
    return;
  }

  mountEl.innerHTML = `
    <div id="ai-agent-box" style="border:1px solid #ddd;padding:12px;border-radius:8px;max-width:360px;font-family:sans-serif;background:#fff;">
      <div id="ai-messages" style="max-height:400px;overflow-y:auto;margin-bottom:8px;"></div>
      <div style="margin-top:8px;display:flex;gap:4px;">
        <input id="ai-input" style="flex:1;padding:6px;border:1px solid #ccc;border-radius:4px;" placeholder="Type here..." />
        <button id="ai-send" style="padding:6px 12px;background:#007bff;color:white;border:none;border-radius:4px;cursor:pointer;">Send</button>
      </div>
    </div>
  `;

  const messagesEl = document.getElementById("ai-messages");
  const inputEl = document.getElementById("ai-input");
  const sendBtn = document.getElementById("ai-send");

  let conversation = [
    { role: "system", content: "You are a form-filling assistant." }
  ];

  function addMessage(role, text) {
    const div = document.createElement("div");
    div.style.marginBottom = "8px";
    div.style.padding = "8px";
    div.style.borderRadius = "4px";
    
    if (role === "assistant") {
      div.style.background = "#f0f0f0";
      div.textContent = "🤖 " + text;
    } else {
      div.style.background = "#e3f2fd";
      div.style.textAlign = "right";
      div.textContent = "🧑 " + text;
    }
    
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  addMessage("assistant", formConfig.ui?.greeting || "Hi! I can help you fill this form.");

  async function sendToBackend(userText) {
    const backendUrl = scriptEl.getAttribute("data-backend-url") || "http://localhost:3000";
    
    try {
      const res = await fetch(`${backendUrl}/llm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteKey,
          formConfig,
          messages: [
            ...conversation,
            { role: "user", content: userText }
          ]
        })
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

    if (res.status === "complete") {
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
