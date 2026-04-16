document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  form.addEventListener("submit", login);
});

async function login(event) {
  event.preventDefault();

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  if (!email || !password) {
    alert("이메일과 비밀번호를 입력하세요.");
    return;
  }

  try {
    const response = await fetch("http://localhost:3000/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });

    const result = await response.json();

    if (response.ok) {
      alert("로그인 성공!");
      localStorage.setItem("token", result.token); // 토큰 저장
      window.location.href = "../main/main.html";       // 리디렉션
    } else {
      alert(result.message || "로그인 실패");
    }
  } catch (error) {
    console.error("로그인 오류:", error);
    alert("서버와의 연결에 실패했습니다.");
  }
}