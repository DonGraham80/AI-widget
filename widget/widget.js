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
    <div id="ai-agent-container" style="position:fixed;bottom:20px;right:20px;z-index:9999;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,Cantarell,sans-serif;">
      <div id="ai-agent-toggle" style="width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.15);font-size:28px;">
        💬
      </div>
      <div id="ai-agent-box" style="display:none;position:absolute;bottom:80px;right:0;width:380px;height:500px;background:#fff;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.15);flex-direction:column;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:16px;display:flex;justify-content:space-between;align-items:center;">
          <div style="font-weight:600;font-size:16px;">AI Assistant</div>
          <div id="ai-agent-close" style="cursor:pointer;font-size:20px;line-height:1;">×</div>
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

  let conversation = [
    { role: "system", content: "You are a form-filling assistant." }
  ];

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
