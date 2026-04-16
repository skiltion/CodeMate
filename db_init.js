const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./database.db")

db.serialize(() => {
  db.run("PRAGMA foreign_keys = ON;");

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      nickname TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(id, nickname)
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS post (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      user_nickname TEXT NOT NULL,
      title TEXT NOT NULL,
      details TEXT NOT NULL,
      prompt TEXT NOT NULL,
      created_at TEXT NOT NULL,
      image BLOB,
      FOREIGN KEY (user_id, user_nickname) REFERENCES users(id, nickname)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS chatbot_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      chatbot_log_data TEXT NOT NULL,
      user_log_data TEXT NOT NULL,
      FOREIGN KEY (post_id) REFERENCES post (id),
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      user_nickname TEXT NOT NULL,
      comment TEXT NOT NULL,
      FOREIGN KEY (post_id) REFERENCES post (id),
      FOREIGN KEY (user_id, user_nickname) REFERENCES users (id, nickname)
    )
  `);

  db.run(`
    CREATE TABLE likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(post_id, user_id),  -- 같은 유저가 한 게시물에 여러 번 좋아요 못 누르게
      FOREIGN KEY(post_id) REFERENCES post(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
    `)

});
  

db.close();