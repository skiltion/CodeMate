let slideIndex = 0;
let slides;

window.addEventListener("load", () => {
  slides = document.querySelectorAll(".carousel-image");
  if (slides.length > 0) {
    slides[0].classList.add("active");
    updateIndicator();
    setInterval(() => showSlide(slideIndex + 1), 5000);
  }

  // 생성하기 버튼 클릭시 posts/create.html로 이동
  document.getElementById("createPostBtn").addEventListener("click", () => {
    location.href = "../posts/create.html";
  });

  // 서버에서 post 이미지와 데이터 불러와서 표시
  fetchPostsAndRender();
});

function showSlide(n) {
  slides[slideIndex].classList.remove("active");
  slideIndex = (n + slides.length) % slides.length;
  slides[slideIndex].classList.add("active");
  updateIndicator();
}

function updateIndicator() {
  const indicator = document.getElementById("carouselIndicator");
  if (!indicator) return;
  indicator.innerHTML = "";
  slides.forEach((_, i) => {
    const dot = document.createElement("span");
    dot.classList.add("dot");
    if (i === slideIndex) dot.classList.add("active");
    indicator.appendChild(dot);
  });
}

function fetchPostsAndRender() {
  fetch("http://localhost:3000/posts")
    .then(res => res.json())
    .then(data => {
      if (data.posts && Array.isArray(data.posts)) {
        const container = document.querySelector(".image-cards");
        container.innerHTML = ""; // 초기화

        data.posts.forEach(post => {
          const base64Image = post.image ? `data:image/png;base64,${post.image}` : "../default.png";

          const card = document.createElement("div");
          card.classList.add("image-card");
          card.style.cursor = "pointer";

          card.innerHTML = `
            <img src="${base64Image}" alt="${post.title}" class="post-image" />
            <div class="post-title">${post.title}</div>
            <div class="post-nickname">작성자: ${post.user_nickname}</div>
          `;

          card.addEventListener("click", () => {
            location.href = `../posts/post.html?id=${post.id}`;
          });

          container.appendChild(card);
        });
      }
    })
    .catch(err => {
      console.error("게시글 불러오기 실패:", err);
    });
}
