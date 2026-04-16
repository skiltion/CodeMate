const chatBody = document.getElementById("chatBody");
const chatInput = document.getElementById("chatInput");
const saveListEl = document.getElementById("saveList");
let firstChat = true;

// URL에서 postId 받아오기
const urlParams = new URLSearchParams(window.location.search);
const postId = urlParams.get("postId");

async function sendMessage() {
  event.preventDefault();

  const text = chatInput.value.trim();
  if (text === "") return;

  if (firstChat) {
    const separator = document.createElement("div");
    separator.className = "new-chat-separator";
    separator.textContent = "새로운 채팅";
    chatBody.appendChild(separator);
    firstChat = false;
  }

  const userMsg = document.createElement("div");
  userMsg.className = "message user";
  userMsg.textContent = text;
  chatBody.appendChild(userMsg);

  const botMsg = document.createElement("div");
  botMsg.className = "message bot";
  botMsg.textContent = "답변을 불러오는 중...";
  chatBody.appendChild(botMsg);

  chatInput.value = "";
  chatBody.scrollTop = chatBody.scrollHeight;

  try {
    const token = localStorage.getItem("token"); // JWT 토큰
    const response = await fetch(`http://localhost:3000/chatbot/${postId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ message: text })
    });

    const result = await response.json();
    if (response.ok) {
      botMsg.textContent = result.chatbotResponse;
    } else {
      botMsg.textContent = "오류 발생: " + result.message;
    }
  } catch (error) {
    console.error(error);
    botMsg.textContent = "서버 연결 실패";
  }
}

function saveCurrentChat() {
  const items = chatBody.querySelectorAll(".message");
  const logs = Array.from(items).map(msg => msg.textContent.trim()).filter(Boolean);
  const entry = document.createElement("div");
  entry.textContent = logs.join(" | ");
  saveListEl.appendChild(entry);
}

function toggleSaveList() {
  saveListEl.style.display = saveListEl.style.display === "block" ? "none" : "block";
}

chatInput.addEventListener("keypress", function (e) {
  if (e.key === "Enter") {
    sendMessage();
  }
});

function changeBackground() {
  const color = document.getElementById("bgPicker").value;
  document.body.style.backgroundColor = color;
}

window.addEventListener("DOMContentLoaded", loadPreviousMessages);

async function loadPreviousMessages() {
  try {
    const token = localStorage.getItem("token");
    const response = await fetch(`http://localhost:3000/chatbot/logs/${postId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      }
    });

    const result = await response.json();

    if (response.ok && result.logs.length > 0) {
      const separator = document.createElement("div");
      separator.className = "new-chat-separator";
      separator.textContent = "이전 채팅 기록";
      chatBody.appendChild(separator);

      result.logs.forEach(log => {
        const userMsg = document.createElement("div");
        userMsg.className = "message user";
        userMsg.textContent = log.user_log_data;
        chatBody.appendChild(userMsg);

        const botMsg = document.createElement("div");
        botMsg.className = "message bot";
        botMsg.textContent = log.chatbot_log_data;
        chatBody.appendChild(botMsg);
      });

      chatBody.scrollTop = chatBody.scrollHeight;
    }

  } catch (error) {
    console.error("이전 메시지 불러오기 실패:", error);
  }
}