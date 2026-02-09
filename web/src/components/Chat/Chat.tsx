import { useState, useRef, useEffect } from "react";
import { useStore } from "../../store/useStore";
import type { AiChatRequest, AiChatResponse } from "../../types/scene";
import "./Chat.css";

const API_URL = "http://localhost:3001";

export function Chat() {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatMessages = useStore((s) => s.chatMessages);
  const addChatMessage = useStore((s) => s.addChatMessage);
  const scene = useStore((s) => s.scene);
  const setOperations = useStore((s) => s.setOperations);
  const isLoading = useStore((s) => s.isLoading);
  const setLoading = useStore((s) => s.setLoading);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handleSend = async () => {
    const message = input.trim();
    if (!message || isLoading) return;

    setInput("");
    addChatMessage({ role: "user", content: message });
    setLoading(true);

    try {
      const request: AiChatRequest = { message, scene };
      const res = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }

      const data: AiChatResponse = await res.json();

      addChatMessage({ role: "assistant", content: data.text });

      // Применяем операции от AI
      if (data.operations.length > 0) {
        const newOps = [...scene.operations, ...data.operations];
        setOperations(newOps);
      }
    } catch (e) {
      const errMsg =
        e instanceof Error ? e.message : "Failed to connect to server";
      addChatMessage({
        role: "assistant",
        content: `Ошибка: ${errMsg}. Убедитесь, что сервер запущен на порту 3001.`,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat">
      <div className="panel-header">ИИ Ассистент</div>
      <div className="chat-messages">
        {chatMessages.length === 0 && (
          <div className="chat-placeholder">
            Опишите, что хотите создать. Например:
            <br />
            &laquo;Создай куб с отверстием насквозь&raquo;
          </div>
        )}
        {chatMessages.map((msg, i) => (
          <div key={i} className={`chat-msg chat-msg-${msg.role}`}>
            <div className="chat-msg-role">
              {msg.role === "user" ? "Вы" : "ИИ"}
            </div>
            <div className="chat-msg-content">{msg.content}</div>
          </div>
        ))}
        {isLoading && (
          <div className="chat-msg chat-msg-assistant">
            <div className="chat-msg-role">ИИ</div>
            <div className="chat-msg-content chat-loading">Думаю...</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="chat-input-area">
        <textarea
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Опишите, что создать..."
          rows={2}
          disabled={isLoading}
        />
        <button
          className="chat-send"
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
        >
          Отправить
        </button>
      </div>
    </div>
  );
}
