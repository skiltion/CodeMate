import java.io.*;
import java.net.InetSocketAddress;
import java.sql.*;
import java.util.*;
import java.net.http.*;
import java.net.URI;

import com.google.gson.Gson;
import com.sun.net.httpserver.*;

public class ChatbotServer {
    private static final String DB_URL = "jdbc:sqlite:database.db";
    private static final Gson gson = new Gson();
    private static String API_KEY;

    public static void main(String[] args) throws Exception {
        API_KEY = loadApiKey();

        HttpServer server = HttpServer.create(new InetSocketAddress(8080), 0);
        server.createContext("/ask", new AskHandler());
        server.createContext("/getLogs", new GetLogsHandler()); // ✅ 로그 핸들러 추가
        server.setExecutor(null);
        System.out.println("서버가 8080번 포트에서 실행 중...");
        server.start();
    }

    // ✅ 대화 로그 조회 핸들러
    static class GetLogsHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!exchange.getRequestMethod().equalsIgnoreCase("POST")) {
                exchange.sendResponseHeaders(405, -1); // Method Not Allowed
                return;
            }

            InputStream is = exchange.getRequestBody();
            String requestBody = new String(is.readAllBytes());
            Map<?, ?> requestMap = gson.fromJson(requestBody, Map.class);

            int postId = ((Double) requestMap.get("postId")).intValue();
            int userId = ((Double) requestMap.get("userId")).intValue();

            try {
                List<Map<String, String>> logs = fetchLogs(postId, userId);
                String jsonResponse = gson.toJson(logs);
                sendJson(exchange, 200, jsonResponse);
            } catch (Exception e) {
                e.printStackTrace();
                String errorJson = gson.toJson(Map.of("error", e.getMessage()));
                sendJson(exchange, 500, errorJson);
            }
        }
    }

    static class AskHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!exchange.getRequestMethod().equalsIgnoreCase("POST")) {
                exchange.sendResponseHeaders(405, -1); // Method Not Allowed
                return;
            }

            InputStream is = exchange.getRequestBody();
            String requestBody = new String(is.readAllBytes());
            Map<?, ?> requestMap = gson.fromJson(requestBody, Map.class);

            int postId = ((Double) requestMap.get("postId")).intValue();
            int userId = ((Double) requestMap.get("userId")).intValue();
            String userMessage = (String) requestMap.get("userMessage");
            String userPrompt = (String) requestMap.get("userPrompt");

            String chatbotResponse;
            try {
                insertMessage(postId, userId, "", userMessage);
                chatbotResponse = callGeminiAPI(userPrompt);
                updateChatbotMessage(postId, userId, chatbotResponse);
            } catch (Exception e) {
                e.printStackTrace();
                String errorJson = gson.toJson(Map.of("error", e.getMessage()));
                sendJson(exchange, 500, errorJson);
                return;
            }

            Map<String, String> responseMap = Map.of("chatbotResponse", chatbotResponse);
            sendJson(exchange, 200, gson.toJson(responseMap));
        }
    }

    private static void sendJson(HttpExchange exchange, int statusCode, String json) throws IOException {
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        byte[] bytes = json.getBytes("UTF-8");
        exchange.sendResponseHeaders(statusCode, bytes.length);
        OutputStream os = exchange.getResponseBody();
        os.write(bytes);
        os.close();
    }

    private static String loadApiKey() throws IOException {
        try (BufferedReader reader = new BufferedReader(new FileReader(".env"))) {
            String line;
            while ((line = reader.readLine()) != null) {
                line = line.trim();
                if (line.startsWith("GEMINI_API_KEY=")) {
                    return line.split("=", 2)[1].trim();
                }
            }
        }
        throw new RuntimeException(".env 파일에서 GEMINI_API_KEY를 찾을 수 없습니다.");
    }

    private static Connection connect() throws SQLException {
        Connection conn = DriverManager.getConnection(DB_URL);
        conn.createStatement().execute("PRAGMA foreign_keys = ON;");
        return conn;
    }

    private static void insertMessage(int postId, int userId, String chatbotMessage, String userMessage) throws SQLException {
        String sql = "INSERT INTO chatbot_log (post_id, user_id, chatbot_log_data, user_log_data) VALUES (?, ?, ?, ?)";
        try (Connection conn = connect(); PreparedStatement pstmt = conn.prepareStatement(sql)) {
            pstmt.setInt(1, postId);
            pstmt.setInt(2, userId);
            pstmt.setString(3, chatbotMessage);
            pstmt.setString(4, userMessage);
            pstmt.executeUpdate();
        }
    }

    private static void updateChatbotMessage(int postId, int userId, String chatbotMessage) throws SQLException {
        String sql = "UPDATE chatbot_log SET chatbot_log_data = ? WHERE post_id = ? AND user_id = ? AND chatbot_log_data = ''";
        try (Connection conn = connect(); PreparedStatement pstmt = conn.prepareStatement(sql)) {
            pstmt.setString(1, chatbotMessage);
            pstmt.setInt(2, postId);
            pstmt.setInt(3, userId);
            pstmt.executeUpdate();
        }
    }

    private static String callGeminiAPI(String prompt) throws Exception {
        String endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=" + API_KEY;

        Map<String, Object> messageContent = Map.of(
                "role", "user",
                "parts", List.of(Map.of("text", prompt))
        );

        Map<String, Object> body = Map.of("contents", List.of(messageContent));
        String jsonBody = gson.toJson(body);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(endpoint))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
                .build();

        HttpClient client = HttpClient.newHttpClient();
        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() != 200) {
            throw new RuntimeException("Gemini API 호출 실패: " + response.body());
        }

        Map<?, ?> responseMap = gson.fromJson(response.body(), Map.class);
        List<?> candidates = (List<?>) responseMap.get("candidates");
        if (candidates == null || candidates.isEmpty()) return "(응답 없음)";

        Map<?, ?> first = (Map<?, ?>) candidates.get(0);
        Map<?, ?> content = (Map<?, ?>) first.get("content");
        List<?> parts = (List<?>) content.get("parts");
        Map<?, ?> part0 = (Map<?, ?>) parts.get(0);

        return part0.get("text").toString();
    }

    // ✅ 로그 조회 기능
    private static List<Map<String, String>> fetchLogs(int postId, int userId) throws SQLException {
        String sql = "SELECT user_log_data, chatbot_log_data FROM chatbot_log WHERE post_id = ? AND user_id = ? ORDER BY id ASC";
        List<Map<String, String>> logs = new ArrayList<>();
        try (Connection conn = connect(); PreparedStatement pstmt = conn.prepareStatement(sql)) {
            pstmt.setInt(1, postId);
            pstmt.setInt(2, userId);
            ResultSet rs = pstmt.executeQuery();
            while (rs.next()) {
                Map<String, String> logEntry = new HashMap<>();
                logEntry.put("user_log_data", rs.getString("user_log_data"));
                logEntry.put("chatbot_log_data", rs.getString("chatbot_log_data"));
                logs.add(logEntry);
            }
        }
        return logs;
    }
}
