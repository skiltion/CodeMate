function handleButtonClick(button) {
  const action = button.dataset.action;
  console.log(`${action} 버튼 클릭됨`);
  button.classList.toggle("clicked");
}

function submitComment() {
  const input = document.getElementById("commentInput");
  const chatBox = document.getElementById("chatBox");

  const text = input.value.trim();
  if (text === "") return;

  const chatMessage = document.createElement("div");
  chatMessage.classList.add("chat-message");

  const commentText = document.createElement("span");
  commentText.textContent = `🗨️ ${text}`;

  const deleteBtn = document.createElement("button");
  deleteBtn.textContent = "❌";
  deleteBtn.className = "delete-btn";
  deleteBtn.onclick = () => chatBox.removeChild(chatMessage);

  chatMessage.appendChild(commentText);
  chatMessage.appendChild(deleteBtn);

  chatBox.insertBefore(chatMessage, chatBox.firstChild);

  chatBox.style.height = "auto";
  input.value = "";
}

// 게시글 ID 추출
function getPostIdFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get("id");
}

// 좋아요 토글
function toggleLike(button, event) {
  event.preventDefault();

  const postId = getPostIdFromUrl();
  const token = localStorage.getItem("token");

  fetch(`http://localhost:3000/post/${postId}/like-toggle`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        alert(data.error);
        return;
      }

      if (data.liked) {
        button.classList.add("active");
      } else {
        button.classList.remove("active");
      }

      if (typeof data.likeCount === "number") {
        button.textContent = `👍 ${data.likeCount}`;
      }
    })
    .catch(err => {
      console.error("좋아요 요청 실패:", err);
      alert("좋아요 처리 중 오류 발생");
    });
}

// 게시글 데이터 로드
document.addEventListener("DOMContentLoaded", () => {
  const postId = getPostIdFromUrl();
  if (!postId) {
    alert("게시글 ID가 없습니다.");
    return;
  }

  const token = localStorage.getItem("token");

  fetch(`http://localhost:3000/post/${postId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  })
    .then(res => res.json())
    .then(data => {
      if (data.message) {
        alert(data.message);
        return;
      }

      const { post, liked } = data;

      document.getElementById("postTitle").textContent = post.title;
      document.getElementById("postDescription").textContent = post.details;

      const imageElement = document.getElementById("postImage");
      imageElement.src = `http://localhost:3000/post/${postId}/image`;
      imageElement.onerror = () => {
        imageElement.src = "../default.png";
      };

      const likeBtn = document.querySelector(".like-btn");
      likeBtn.textContent = `👍 ${post.likeCount}`;
      liked ? likeBtn.classList.add("active") : likeBtn.classList.remove("active");
      likeBtn.addEventListener("click", (event) => toggleLike(likeBtn, event));
    })
    .catch(err => {
      console.error("데이터 로딩 실패:", err);
      alert("게시글을 불러오는 중 문제가 발생했습니다.");
    });

  // 삭제 기능 모달 처리
  const deleteBtn = document.getElementById("deleteBtn");
  const deleteModal = document.getElementById("deleteModal");
  const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
  const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");

  deleteBtn.addEventListener("click", () => {
    deleteModal.style.display = "flex";
  });

  cancelDeleteBtn.addEventListener("click", () => {
    deleteModal.style.display = "none";
  });

  confirmDeleteBtn.addEventListener("click", () => {
    const token = localStorage.getItem("token");

    fetch(`http://localhost:3000/post/${postId}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    })
      .then(res => {
        if (!res.ok) throw new Error("삭제 실패");
        return res.json();
      })
    .then(data => {
      deleteModal.style.display = "none";
      alert(data.message || "게시글이 삭제되었습니다.");
      console.log("이동 시작"); // 🔍 확인 로그
      setTimeout(() => {
      console.log("메인 페이지로 이동 시도"); // 🔍 확인 로그
      window.location.href = "../main/main.html";
      }, 1000);
      })
      .catch(err => {
        console.error("삭제 실패:", err);
        alert("삭제 처리 중 오류가 발생했습니다.");
      })
      .finally(() => {
        deleteModal.style.display = "none";
      });
  });
});

function getPostIdFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get("id");
}

function goToChatbot() {
  const postId = getPostIdFromUrl();
  if (!postId) {
    alert("게시글 ID가 없습니다.");
    return;
  }
  // chatbot.html로 이동 시 id를 쿼리스트링으로 붙임
  location.href = `../chatbot/chatbot.html?postId=${postId}`;
}