document.addEventListener("DOMContentLoaded", () => {
  const imageInput = document.getElementById("imageInput");
  const imagePreview = document.getElementById("imagePreview");
  const createBtn = document.getElementById("createPostBtn");

  // 이미지 미리보기 기능
  imageInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) {
      imagePreview.innerHTML = "이미지 미리보기";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      imagePreview.innerHTML = `<img src="${reader.result}" alt="미리보기 이미지">`;
    };
    reader.readAsDataURL(file);
  });

  // 게시글 생성 요청
  createBtn.addEventListener("click", async () => {
    const form = document.getElementById("createForm");
    const formData = new FormData(form);

    const token = localStorage.getItem("token");
    if (!token) {
      alert("로그인이 필요합니다.");
      return;
    }

    const title = formData.get("title")?.trim();
    const details = formData.get("details")?.trim();
    const prompt = formData.get("prompt")?.trim();

    if (!title || !details || !prompt) {
      alert("모든 입력을 채워주세요.");
      return;
    }

    try {
      const res = await fetch("http://localhost:3000/post", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      const result = await res.json();

      if (res.ok) {
        alert("게시글이 성공적으로 작성되었습니다.");
        window.location.href = "../main/main.html";
      } else {
        alert(result.message || "작성 실패");
      }
    } catch (err) {
      console.error("요청 실패:", err);
      alert("서버에 연결할 수 없습니다.");
    }
  });
});
