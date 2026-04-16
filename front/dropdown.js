document.addEventListener("DOMContentLoaded", () => {
  const userIcon = document.querySelector(".user-icon");
  const dropdown = document.getElementById("dropdownMenu");
  const token = localStorage.getItem("token"); // JWT 토큰으로 로그인 상태 판단

  // 로그인 상태에 따라 메뉴 구성 변경
  if (token) {
    dropdown.innerHTML = `
      <a href="../login_sign/profile.html">회원정보</a>
      <a href="#" id="logoutBtn">로그아웃</a>
    `;
  } else {
    dropdown.innerHTML = `
      <a href="../login_sign/login.html">로그인</a>
      <a href="../login_sign/sign.html">회원가입</a>
    `;
  }

  // 드롭다운 토글 기능
  let dropdownTimeout;
  let dropdownClicked = false;

  userIcon.addEventListener("mouseenter", () => {
    if (!dropdownClicked) {
      clearTimeout(dropdownTimeout);
      dropdown.classList.add("show");
    }
  });

  userIcon.addEventListener("mouseleave", () => {
    if (!dropdownClicked) {
      dropdownTimeout = setTimeout(() => {
        dropdown.classList.remove("show");
      }, 700);
    }
  });

  dropdown.addEventListener("mouseenter", () => {
    clearTimeout(dropdownTimeout);
  });

  dropdown.addEventListener("mouseleave", () => {
    if (!dropdownClicked) {
      dropdownTimeout = setTimeout(() => {
        dropdown.classList.remove("show");
      }, 700);
    }
  });

  userIcon.addEventListener("click", () => {
    dropdownClicked = !dropdownClicked;
    dropdown.classList.toggle("show");
  });

  document.addEventListener("click", (e) => {
    const isInside = userIcon.contains(e.target) || dropdown.contains(e.target);
    if (!isInside) {
      dropdownClicked = false;
      dropdown.classList.remove("show");
    }
  });

  // 로그아웃 기능
  document.addEventListener("click", (e) => {
    if (e.target.id === "logoutBtn") {
      e.preventDefault();
      localStorage.removeItem("token");
      alert("로그아웃되었습니다.");
      location.href = "../main/Main.html"; // 메인페이지로 이동
    }
  });
});