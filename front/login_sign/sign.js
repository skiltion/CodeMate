document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("signupForm");
  form.addEventListener("submit", signup);
});

async function signup(event) {
  event.preventDefault();

  const form = event.target;

  const username = form.elements["username"].value.trim();
  const email = form.elements["email"].value.trim();
  const password = form.elements["password"].value;
  const passwordConfirm = form.elements["passwordConfirm"].value;

  if (password !== passwordConfirm) {
    alert("비밀번호가 일치하지 않습니다.");
    return;
  }

  try {
    const response = await fetch("http://localhost:3000/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password, nickname: username }),
    });

    const result = await response.json();

    if (response.ok) {
      alert("회원가입이 완료되었습니다.");
      window.location.href = "login.html";
    } else {
      alert(result.message || "회원가입에 실패했습니다.");
    }
  } catch (error) {
    console.error("회원가입 오류:", error);
    alert("서버와의 연결에 실패했습니다.");
  }
}
