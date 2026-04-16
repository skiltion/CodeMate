require("dotenv").config();

const express = require("express");
const jwt = require("jsonwebtoken");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");
const cors = require("cors");
const axios = require("axios");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const upload = multer({ storage: multer.memoryStorage() });
const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.JWT_SECRET;

app.use(cors());
app.use(express.json());
app.use(express.static("front"));

// postId, userId를 매개변수로 넘겨야 함
async function getGeminiAnswer(postId, userId, userMessage, userPrompt) {
  try {
    const response = await axios.post("http://localhost:8080/ask", {
      postId,
      userId,
      userMessage,
      userPrompt
    });

    // response.data = { chatbotResponse: "응답 메시지" }
    return response.data.chatbotResponse;
  } catch (error) {
    console.error("Java 서버 호출 실패:", error.response?.data || error.message);
    throw error;
  }
}

function getKSTTime() {
  const date = new Date();
  const kstDate = new Date(date.getTime() + 9 * 60 * 60 * 1000); // UTC+9
  return kstDate.toISOString().replace("T", " ").slice(0, 19);
}

function optionalAuthenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  
  if (!token) {
    req.user = null;
    return next();
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      req.user = null;
    } else {
      req.user = user;
    }
    next();
  });
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "토큰이 없습니다." });
  }

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "유효하지 않은 토큰입니다." });
    }

    req.user = user;
    next();
  });
}

// ✅ Java 서버에 사용자 메시지 전송
async function insertUser(postId, usersId, userMessage) {
  try {
    const response = await axios.post("http://localhost:8081/insertUser", {
      postId,
      userId: usersId,
      userMessage,
    });
    console.log("Java insertUser 응답:", response.data);
  } catch (error) {
    console.error("insertUser 에러:", error.response?.data || error.message);
  }
}

// ✅ Java 서버에 챗봇 메시지 생성 요청
async function insertChatbot(postId, usersId) {
  try {
    const response = await axios.post("http://localhost:8081/insertChatbot", {
      postId,
      userId: usersId,
    });
    console.log("Java insertChatbot 응답:", response.data);
  } catch (error) {
    console.error("insertChatbot 에러:", error.response?.data || error.message);
  }
}

app.post("/register", async (req, res) => {
  const { email, password, nickname } = req.body;

  if (!email || !password || !nickname) {
    return res.status(400).json({ message: "이메일, 비밀번호, 닉네임을 입력하세요." });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: "이메일 형식이 올바르지 않습니다." });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const createdAt = getKSTTime();
    const db = new sqlite3.Database("./database.db");

    const query = `INSERT INTO users (email, password, nickname, created_at) VALUES (?, ?, ?, ?)`;
    db.run(query, [email, hashedPassword, nickname, createdAt], function (err) {
      db.close();

      if (err) {
        if (err.code === "SQLITE_CONSTRAINT") {
          return res.status(409).json({ message: "이미 등록된 이메일 또는 닉네임입니다." });
        }
        return res.status(500).json({ message: "서버 오류", error: err.message });
      }

      res.status(200).json({ message: "회원가입 성공", userId: this.lastID });
    });
  } catch (error) {
    res.status(500).json({ message: "비밀번호 해싱 실패", error: error.message });
  }
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ message: "이메일과 비밀번호를 입력하세요." });

  const db = new sqlite3.Database("./database.db");

  db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
    if (err) {
      db.close();
      return res.status(500).json({ message: "서버 오류" });
    }

    if (!user) {
      db.close();
      return res.status(401).json({ message: "이메일 또는 비밀번호가 잘못되었습니다." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      db.close();
      return res.status(401).json({ message: "이메일 또는 비밀번호가 잘못되었습니다." });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, SECRET_KEY, {
      expiresIn: "1d"
    });

    db.close();
    return res.json({
      message: "로그인 성공",
      token,
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        created_at: user.created_at
      }
    });
  });
});

app.post("/post", authenticateToken, upload.single("image"), (req, res) => {
  const { title, details, prompt } = req.body;
  const { id: user_id } = req.user;

  if (!title || !details || !prompt) {
    return res.status(400).json({ message: "제목, 내용, 프롬프트를 모두 입력하세요." });
  }

  const db = new sqlite3.Database("./database.db");

  db.get(`SELECT nickname FROM users WHERE id = ?`, [user_id], (err, row) => {
    if (err || !row) {
      db.close();
      return res.status(500).json({ message: "사용자 닉네임 조회 실패" });
    }

    const user_nickname = row.nickname;
    const createdAt = getKSTTime();

    const insertPost = (imageBuffer) => {
      const query = `
        INSERT INTO post (user_id, user_nickname, title, details, prompt, created_at, image)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      db.run(
        query,
        [user_id, user_nickname, title, details, prompt, createdAt, imageBuffer],
        function (err) {
          db.close();
          if (err) {
            return res.status(500).json({ message: "게시글 저장 실패", error: err.message });
          }
          res.status(201).json({
            message: "게시글 작성 성공",
            postId: this.lastID,
            author: user_nickname
          });
        }
      );
    };

    if (req.file) {
      sharp(req.file.buffer)
        .resize(300, 300)
        .toBuffer()
        .then(resizedBuffer => insertPost(resizedBuffer))
        .catch(err => {
          db.close();
          return res.status(500).json({ message: "이미지 리사이징 실패", error: err.message });
        });
    } else {
      const defaultImagePath = path.join(__dirname, "default.png");
      fs.readFile(defaultImagePath, (err, data) => {
        if (err) {
          db.close();
          return res.status(500).json({ message: "기본 이미지 로드 실패", error: err.message });
        }

        sharp(data)
          .resize(300, 300)
          .toBuffer()
          .then(resizedBuffer => insertPost(resizedBuffer))
          .catch(err => {
            db.close();
            return res.status(500).json({ message: "기본 이미지 리사이징 실패", error: err.message });
          });
      });
    }
  });
});

app.put("/post/:id", authenticateToken, upload.single("image"), (req, res) => {
  const postId = req.params.id;
  const { title, details, prompt } = req.body;
  const userId = req.user.id;

  if (!title || !details || !prompt) {
    return res.status(400).json({ message: "제목, 내용, 프롬프트를 모두 입력하세요." });
  }

  const db = new sqlite3.Database("./database.db");

  db.get("SELECT * FROM post WHERE id = ?", [postId], (err, row) => {
    if (err) {
      db.close();
      return res.status(500).json({ message: "게시글 조회 실패" });
    }

    if (!row) {
      db.close();
      return res.status(404).json({ message: "게시글을 찾을 수 없습니다." });
    }

    if (row.user_id !== userId) {
      db.close();
      return res.status(403).json({ message: "게시글 수정 권한이 없습니다." });
    }

    const queryWithImage = `
      UPDATE post SET title = ?, details = ?, prompt = ?, image = ? WHERE id = ?
    `;
    const queryWithoutImage = `
      UPDATE post SET title = ?, details = ?, prompt = ? WHERE id = ?
    `;

    const updatePost = (imageBuffer) => {
      const params = imageBuffer
        ? [title, details, prompt, imageBuffer, postId]
        : [title, details, prompt, postId];

      const finalQuery = imageBuffer ? queryWithImage : queryWithoutImage;

      db.run(finalQuery, params, function (err) {
        db.close();
        if (err) {
          return res.status(500).json({ message: "게시글 수정 실패", error: err.message });
        }

        res.json({ message: "게시글이 수정되었습니다." });
      });
    };

    if (req.file) {
      sharp(req.file.buffer)
        .resize(300, 300)
        .toBuffer()
        .then(resizedBuffer => updatePost(resizedBuffer))
        .catch(err => {
          db.close();
          return res.status(500).json({ message: "이미지 리사이징 실패", error: err.message });
        });
    } else {
      updatePost(null);
    }
  });
});


app.delete("/post/:id", authenticateToken, (req, res) => {
  const postId = req.params.id;
  const userId = req.user.id;

  const db = new sqlite3.Database("./database.db");

  db.get("SELECT * FROM post WHERE id = ?", [postId], (err, row) => {
    if (err) {
      db.close();
      return res.status(500).json({ message: "게시글 조회 실패" });
    }

    if (!row) {
      db.close();
      return res.status(404).json({ message: "게시글을 찾을 수 없습니다." });
    }

    if (row.user_id !== userId) {
      db.close();
      return res.status(403).json({ message: "게시글 삭제 권한이 없습니다." });
    }

    db.run("DELETE FROM post WHERE id = ?", [postId], function (err) {
      db.close();
      if (err) {
        return res.status(500).json({ message: "게시글 삭제 실패", error: err.message });
      }

      res.json({ message: "게시글이 삭제되었습니다." });
    });
  });
});

app.get("/posts", (req, res) => {
  const db = new sqlite3.Database("./database.db");

  const query = `SELECT id, title, user_nickname, 
    -- image는 Blob형이므로 base64로 변환해야 하므로 처리 필요
    image 
    FROM post ORDER BY created_at DESC`;

  db.all(query, [], (err, rows) => {
    if (err) {
      db.close();
      return res.status(500).json({ message: "게시글 조회 실패", error: err.message });
    }

    // image Blob -> base64 인코딩
    const posts = rows.map(row => {
      let base64Image = null;
      if (row.image) {
        base64Image = Buffer.from(row.image).toString("base64");
      }
      return {
        id: row.id,
        title: row.title,
        user_nickname: row.user_nickname,
        image: base64Image
      };
    });

    db.close();
    res.json({ posts });
  });
});

app.get("/post/:id", optionalAuthenticateToken, (req, res) => {
  const postId = req.params.id;
  const userId = req.user ? req.user.id : null;
  const db = new sqlite3.Database("./database.db");

  const postQuery = `
    SELECT p.id, p.title, p.details, p.user_nickname, p.created_at,
           COUNT(l.id) AS likeCount
    FROM post p
    LEFT JOIN likes l ON p.id = l.post_id
    WHERE p.id = ?
    GROUP BY p.id
  `;

  db.get(postQuery, [postId], (err, postRow) => {
    if (err) {
      db.close();
      return res.status(500).json({ message: "게시글 조회 실패", error: err.message });
    }

    if (!postRow) {
      db.close();
      return res.status(404).json({ message: "게시글을 찾을 수 없습니다." });
    }

    // 로그인하지 않은 경우 liked = false
    if (!userId) {
      db.close();
      return res.json({
        post: postRow,
        liked: false
      });
    }

    const likedCheckQuery = `
      SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?
    `;

    db.get(likedCheckQuery, [postId, userId], (err, likeRow) => {
      db.close();
      if (err) {
        return res.status(500).json({ message: "좋아요 여부 확인 실패", error: err.message });
      }

      const liked = !!likeRow;
      return res.json({
        post: postRow,
        liked: liked
      });
    });
  });
});

app.get("/post/:id/image", (req, res) => {
  const postId = req.params.id;
  const db = new sqlite3.Database("./database.db");

  db.get("SELECT image FROM post WHERE id = ?", [postId], (err, row) => {
    db.close();
    if (err || !row) {
      return res.status(404).send("이미지를 찾을 수 없습니다.");
    }

    if (!row.image) {
      return res.status(404).send("해당 게시글에는 이미지가 없습니다.");
    }

    // 이미지가 Buffer 형태라면
    const imgBuffer = row.image;

    res.setHeader("Content-Type", "image/png");
    res.send(imgBuffer);
  });
});


app.post("/post/:id/comments", authenticateToken, (req, res) => {
  const postId = req.params.id;
  const { comment } = req.body;
  const userId = req.user.id;

  if (!comment) {
    return res.status(400).json({ error: "댓글 내용을 입력하세요." });
  }

const db = new sqlite3.Database("./database.db");

db.get(
  "SELECT nickname FROM users WHERE id = ?",
  [userId],
  (err, row) => {
    if (err) {
      db.close();
      return res.status(500).json({ error: "사용자 정보를 가져오는 중 오류 발생" });
    }

    if (!row) {
      db.close();
      return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
    }

    const userNickname = row.nickname;

    db.run(
      "INSERT INTO comments (post_id, user_id, user_nickname, comment) VALUES (?, ?, ?, ?)",
      [postId, userId, userNickname, comment],
      function (err) {
        db.close();
        if (err) {
          console.error("댓글 저장 실패:", err.message);
          return res.status(500).json({ error: "댓글 저장 중 오류 발생" });
        }
        res.status(201).json({ message: "댓글이 등록되었습니다.", commentId: this.lastID });
      }
    );
  }
);
});

app.get("/post/:id/comments", (req, res) => {
  const postId = req.params.id;
  const db = new sqlite3.Database("./database.db");

  const query = `
    SELECT id, user_id, user_nickname, comment
    FROM comments
    WHERE post_id = ?
  `;

  db.all(query, [postId], (err, rows) => {
    db.close();

    if (err) {
      console.error("❌ 댓글 조회 실패:", err.message);
      return res.status(500).json({ error: "댓글 조회 중 오류 발생" });
    }

    res.json({ comments: rows });
  });
});

app.delete("/post/:id/comments/:commentId", authenticateToken, (req, res) => {
  const { commentId } = req.params;
  const userId = req.user.id;

  const db = new sqlite3.Database("./database.db");

  db.get("SELECT user_id FROM comments WHERE id = ?", [commentId], (err, row) => {
      if (err) {
          console.error("❌ 댓글 조회 실패:", err.message);
          return res.status(500).json({ error: "댓글 삭제 중 오류 발생" });
      }

      if (!row || row.user_id !== userId) {
          return res.status(403).json({ error: "삭제 권한이 없습니다." });
      }

      db.run("DELETE FROM comments WHERE id = ?", [commentId], function (err) {
          if (err) {
              console.error("❌ 댓글 삭제 실패:", err.message);
              return res.status(500).json({ error: "댓글 삭제 중 오류 발생" });
          }
          res.json({ message: "댓글이 삭제되었습니다." });
      });
  });
});

app.post("/post/:id/like-toggle", authenticateToken, (req, res) => {
  const postId = req.params.id;
  const userId = req.user.id;
  const db = new sqlite3.Database("./database.db");

  const checkQuery = `SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?`;

  db.get(checkQuery, [postId, userId], (err, row) => {
    if (err) {
      console.error("좋아요 확인 오류:", err.message);
      db.close();
      return res.status(500).json({ error: "좋아요 상태 확인 중 오류 발생" });
    }

    if (row) {
      // 이미 눌렀으면 삭제
      const deleteQuery = `DELETE FROM likes WHERE post_id = ? AND user_id = ?`;
      db.run(deleteQuery, [postId, userId], function (err) {
        if (err) {
          console.error("좋아요 취소 오류:", err.message);
          db.close();
          return res.status(500).json({ error: "좋아요 취소 중 오류 발생" });
        }

        // 좋아요 수 다시 계산해서 보내기
        db.get(`SELECT COUNT(*) AS likeCount FROM likes WHERE post_id = ?`, [postId], (err, countRow) => {
          db.close();
          if (err) {
            return res.status(500).json({ error: "좋아요 수 계산 오류" });
          }

          return res.json({
            liked: false,
            likeCount: countRow.likeCount,
            message: "좋아요를 취소했습니다."
          });
        });
      });
    } else {
      // 안 눌렀으면 등록
      const insertQuery = `INSERT INTO likes (post_id, user_id) VALUES (?, ?)`;
      db.run(insertQuery, [postId, userId], function (err) {
        if (err) {
          console.error("좋아요 등록 오류:", err.message);
          db.close();
          return res.status(500).json({ error: "좋아요 등록 중 오류 발생" });
        }

        // 좋아요 수 다시 계산해서 보내기
        db.get(`SELECT COUNT(*) AS likeCount FROM likes WHERE post_id = ?`, [postId], (err, countRow) => {
          db.close();
          if (err) {
            return res.status(500).json({ error: "좋아요 수 계산 오류" });
          }

          return res.status(201).json({
            liked: true,
            likeCount: countRow.likeCount,
            message: "좋아요를 눌렀습니다."
          });
        });
      });
    }
  });
});

app.post("/chatbot/:postId", authenticateToken, async (req, res) => {
  const postId = parseInt(req.params.postId);
  const userId = req.user.id;
  const userMessage = req.body?.message || "안녕";

  if (!postId) return res.status(400).json({ message: "postId가 필요합니다." });

  // 게시글의 prompt 값을 DB에서 읽어오기
  const db = new sqlite3.Database("./database.db");
  db.get("SELECT prompt FROM post WHERE id = ?", [postId], async (err, row) => {
    if (err || !row) {
      db.close();
      return res.status(500).json({ message: "프롬프트 조회 실패" });
    }
    const userPrompt = row.prompt;
    db.close();

    try {
      const chatbotResponse = await getGeminiAnswer(postId, userId, userMessage, userPrompt);
      res.json({ chatbotResponse });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Java 서버 요청 실패", error: error.message });
    }
  });
});

app.post("/chatbot/:postId", authenticateToken, async (req, res) => {
  const postId = parseInt(req.params.postId, 10);
  const userId = req.user.id;
  const userMessage = req.body.message;

  if (!userMessage || !postId || !userId) {
    return res.status(400).json({ message: "필수 정보 누락" });
  }

  const db = new sqlite3.Database("./database.db");

  db.get("SELECT prompt FROM post WHERE id = ?", [postId], async (err, row) => {
    if (err || !row) {
      db.close();
      return res.status(404).json({ message: "프롬프트를 찾을 수 없습니다." });
    }

    const prompt = row.prompt;
    db.close();

    try {
      // 1. 사용자 메시지 저장 (Java 서버)
      await insertUser(postId, userId, userMessage);

      // 2. 챗봇 응답 생성 요청
      const chatbotResponse = await getGeminiAnswer(postId, userId, userMessage, prompt);

      // 3. 챗봇 응답 저장 (Java 서버)
      await insertChatbot(postId, userId);

      // 4. 응답 반환
      return res.status(200).json({ chatbotResponse });
    } catch (error) {
      return res.status(500).json({ message: "챗봇 응답 생성 실패", error: error.message });
    }
  });
});

app.get("/chatbot/logs/:postId", authenticateToken, (req, res) => {
  const postId = parseInt(req.params.postId, 10);
  const userId = req.user.id;

  const db = new sqlite3.Database("./database.db");

  const query = `
    SELECT user_log_data, chatbot_log_data
    FROM chatbot_log
    WHERE post_id = ? AND user_id = ?
    ORDER BY id ASC
  `;

  db.all(query, [postId, userId], (err, rows) => {
    db.close();
    if (err) {
      console.error("DB 오류:", err);
      return res.status(500).json({ message: "기록을 불러오는 중 오류 발생" });
    }

    return res.status(200).json({ logs: rows });
  });
});
app.listen(PORT, () => {
  console.log(`서버가 http://localhost:${PORT} 에서 실행 중`);
});
