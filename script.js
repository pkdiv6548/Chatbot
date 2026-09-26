const form = document.getElementById("chatForm");
const input = document.getElementById("messageInput");
const messages = document.getElementById("messages");
const sendButton = document.getElementById("sendButton");
const status = document.getElementById("status");
const routeInfo = document.getElementById("routeInfo");
const clearButton = document.getElementById("clearButton");

const history = [];

function addMessage(role, text, meta = role === "user" ? "You" : "AI") {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  const p = document.createElement("p");
  p.textContent = text;
  bubble.appendChild(p);

  const metaEl = document.createElement("span");
  metaEl.className = "meta";
  metaEl.textContent = meta;

  wrapper.append(bubble, metaEl);
  messages.appendChild(wrapper);
  messages.scrollTop = messages.scrollHeight;
  return wrapper;
}

function addTyping() {
  const wrapper = document.createElement("div");
  wrapper.className = "message assistant";
  wrapper.id = "typing";

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  const typing = document.createElement("div");
  typing.className = "typing";
  typing.innerHTML = "<span></span><span></span><span></span>";
  bubble.appendChild(typing);

  wrapper.append(bubble);
  messages.appendChild(wrapper);
  messages.scrollTop = messages.scrollHeight;
}

function removeTyping() {
  document.getElementById("typing")?.remove();
}

function setBusy(busy) {
  sendButton.disabled = busy;
  input.disabled = busy;
  status.textContent = busy ? "Thinking…" : "Ready";
}

function autoResize() {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 150)}px`;
}

input.addEventListener("input", autoResize);

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const message = input.value.trim();
  if (!message || sendButton.disabled) return;

  addMessage("user", message);
  history.push({ role: "user", text: message });
  input.value = "";
  autoResize();
  addTyping();
  setBusy(true);

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        history: history.slice(-12)
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "The server could not process the request.");
    }

    removeTyping();
    addMessage("assistant", data.reply, data.route === "jev" ? "AI · Jev decision + Gemini" : "AI · Gemini");
    history.push({ role: "assistant", text: data.reply });

    routeInfo.textContent =
      data.route === "jev"
        ? "Automatic route: Jev decision → Gemini response"
        : "Automatic route: Gemini";
  } catch (error) {
    removeTyping();
    addMessage("assistant", `Error: ${error.message}`, "System");
    routeInfo.textContent = "Request failed";
  } finally {
    setBusy(false);
    input.focus();
  }
});

clearButton.addEventListener("click", () => {
  history.length = 0;
  messages.innerHTML = "";
  routeInfo.textContent = "Automatic routing enabled";
  addMessage("assistant", "Chat cleared. Ask me anything.", "AI");
  input.focus();
});

input.focus();
