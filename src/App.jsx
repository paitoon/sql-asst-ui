import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import "./App.css";
import api from "./api";
import { authorizedStreamFetch } from "./streamFetch";
import { useAuth } from "./AuthContext";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import TableChart from "./TableChart";
import { extractFirstGfmTable, autoCoerceNumbers } from "./tablePlot";
import { useAudioRecorder } from "./hooks/useAudioRecorder";

function makeId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function makeDefaultAssistantMessage() {
  const now = new Date().toISOString();
  return {
    id: makeId("assistant"),
    role: "assistant",
    text: "Hi! What do you want to know. Tell me.",
    createdAt: now,
  };
}

function makeNewConversation() {
  const now = new Date().toISOString();
  return {
    id: makeId("chat"),
    title: "New Chat",
    createdAt: now,
    updatedAt: now,
    messages: [makeDefaultAssistantMessage()],
  };
}

function buildConversationTitle(text) {
  const trimmed = String(text || "").trim().replace(/\s+/g, " ");
  if (!trimmed) return "New Chat";
  return trimmed.length > 40 ? `${trimmed.slice(0, 40)}...` : trimmed;
}

function sortConversations(list) {
  return [...list].sort(
    (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
  );
}

function normalizeConversation(conv) {
  return {
    ...conv,
    messages: (conv.messages || []).map((m) => ({
      ...m,
      streaming: false,
    })),
  };
}

function upsertConversationInList(list, updatedConversation) {
  const exists = list.some((c) => c.id === updatedConversation.id);
  const next = exists
    ? list.map((c) => (c.id === updatedConversation.id ? updatedConversation : c))
    : [updatedConversation, ...list];
  return sortConversations(next);
}

export default function App() {
  const { user, logout } = useAuth();

  const requestUserId = useMemo(() => {
    return user?.username || user?.email || user?.id || "anonymous";
  }, [user]);

  const [input, setInput] = useState("");
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem("chat_sidebar_width");
    const n = saved ? Number(saved) : 320;
    return Number.isFinite(n) ? n : 320;
  });

  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= 768;
  });

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const resizingRef = useRef(false);
  const bottomRef = useRef(null);
  const conversationsRef = useRef([]);

  const {
    status: recStatus,
    blob: recBlob,
    mimeType: recMime,
    error: recError,
    start: startRec,
    stop: stopRec,
    reset: resetRec,
  } = useAudioRecorder();

  const recUrl = useMemo(
    () => (recBlob ? URL.createObjectURL(recBlob) : null),
    [recBlob]
  );

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    let cancelled = false;

    async function loadConversations() {
      setHistoryLoaded(false);
      setError("");

      try {
        const res = await api.get("/conversations");
        const data = Array.isArray(res.data)
          ? sortConversations(res.data.map(normalizeConversation))
          : [];

        if (cancelled) return;

        setConversations(data);
        setActiveConversationId((prev) => {
          if (prev && data.some((c) => c.id === prev)) return prev;
          return data[0]?.id || "";
        });
      } catch (e) {
        console.error(
          "Failed to load conversations",
          e?.response?.status,
          e?.response?.data || e
        );

        if (cancelled) return;

        setConversations([]);
        setActiveConversationId("");
        setError(
          e?.response?.data?.detail ||
            e?.message ||
            "Failed to load server conversation history."
        );
      } finally {
        if (!cancelled) setHistoryLoaded(true);
      }
    }

    loadConversations();

    return () => {
      cancelled = true;
    };
  }, [requestUserId]);

  useEffect(() => {
    localStorage.setItem("chat_sidebar_width", String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    return () => {
      if (recUrl) URL.revokeObjectURL(recUrl);
    };
  }, [recUrl]);

  useEffect(() => {
    function handleResize() {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      if (!mobile) setMobileSidebarOpen(false);
    }

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    document.body.style.overflow = mobileSidebarOpen ? "hidden" : "auto";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [isMobile, mobileSidebarOpen]);

  const activeConversation = useMemo(() => {
    return conversations.find((c) => c.id === activeConversationId) || null;
  }, [conversations, activeConversationId]);

  const messages = activeConversation?.messages || [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, activeConversationId]);

  const startResize = useCallback(() => {
    if (isMobile) return;
    resizingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [isMobile]);

  const stopResize = useCallback(() => {
    resizingRef.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  const onMouseMove = useCallback(
    (e) => {
      if (!resizingRef.current || isMobile) return;
      const minWidth = 220;
      const maxWidth = 700;
      const nextWidth = Math.min(Math.max(e.clientX, minWidth), maxWidth);
      setSidebarWidth(nextWidth);
    },
    [isMobile]
  );

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", stopResize);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", stopResize);
    };
  }, [onMouseMove, stopResize]);

  function updateConversationLocal(conversationId, updater) {
    setConversations((prev) => {
      const target = prev.find((c) => c.id === conversationId);
      if (!target) return prev;
      const updated = updater(target);
      return upsertConversationInList(prev, updated);
    });
  }

  async function persistConversationObject(conversation) {
    if (!conversation?.id) return;
    await api.put(`/conversations/${conversation.id}`, conversation);
  }

  async function createConversation() {
    const next = makeNewConversation();

    try {
      await api.post("/conversations", next);
      setConversations((prev) => upsertConversationInList(prev, next));
      setActiveConversationId(next.id);
      setInput("");
      setError("");
      if (isMobile) setMobileSidebarOpen(false);
    } catch (e) {
      console.error(
        "Failed to create conversation",
        e?.response?.status,
        e?.response?.data || e
      );
      setError(
        e?.response?.data?.detail ||
          e?.message ||
          "Failed to create conversation."
      );
    }
  }

  function openConversation(id) {
    setActiveConversationId(id);
    setError("");
    if (isMobile) setMobileSidebarOpen(false);
  }

  async function deleteConversation(id) {
    try {
      await api.delete(`/conversations/${id}`);

      setConversations((prev) => {
        const next = prev.filter((c) => c.id !== id);

        setActiveConversationId((currentActiveId) => {
          if (currentActiveId !== id) return currentActiveId;
          return next[0]?.id || "";
        });

        return next;
      });

      if (isMobile) setMobileSidebarOpen(false);
      setError("");
    } catch (e) {
      console.error(
        "Failed to delete conversation",
        e?.response?.status,
        e?.response?.data || e
      );
      setError(
        e?.response?.data?.detail ||
          e?.message ||
          "Failed to delete conversation."
      );
    }
  }

  async function renameConversation(id) {
    const target = conversationsRef.current.find((c) => c.id === id);
    if (!target) return;

    const nextTitle = window.prompt("Rename conversation", target.title);
    if (nextTitle == null) return;

    const trimmed = nextTitle.trim();
    if (!trimmed) return;

    const updated = {
      ...target,
      title: trimmed,
      updatedAt: new Date().toISOString(),
    };

    setConversations((prev) => upsertConversationInList(prev, updated));

    try {
      await api.put(`/conversations/${id}`, updated);
      setError("");
    } catch (e) {
      console.error(
        "Failed to rename conversation",
        e?.response?.status,
        e?.response?.data || e
      );
      setError(
        e?.response?.data?.detail ||
          e?.message ||
          "Failed to rename conversation."
      );
    }
  }

  async function ensureConversationForSend() {
    if (activeConversation) return activeConversation;

    const fresh = makeNewConversation();
    await api.post("/conversations", fresh);
    setConversations((prev) => upsertConversationInList(prev, fresh));
    setActiveConversationId(fresh.id);
    return fresh;
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    let conversation;

    try {
      conversation = await ensureConversationForSend();
    } catch (e) {
      console.error(
        "Failed to prepare conversation",
        e?.response?.status,
        e?.response?.data || e
      );
      setError(
        e?.response?.data?.detail ||
          e?.message ||
          "Failed to create conversation."
      );
      return;
    }

    const conversationId = conversation.id;
    const now = new Date().toISOString();

    const userMessage = {
      id: makeId("user"),
      role: "user",
      text,
      createdAt: now,
    };

    const assistantMessageId = makeId("assistant");

    const hasRealUserMessage = conversation.messages.some(
      (m) => m.role === "user" && String(m.text || "").trim()
    );

    setError("");
    setInput("");

    const optimisticConversation = {
      ...conversation,
      title: hasRealUserMessage
        ? conversation.title
        : buildConversationTitle(text),
      updatedAt: now,
      messages: [
        ...conversation.messages,
        userMessage,
        {
          id: assistantMessageId,
          role: "assistant",
          text: "",
          msgType: "ask",
          streaming: true,
          createdAt: now,
        },
      ],
    };

    setConversations((prev) =>
      upsertConversationInList(prev, optimisticConversation)
    );
    setActiveConversationId(conversationId);

    try {
      await persistConversationObject(optimisticConversation);
    } catch (e) {
      console.error(
        "Failed to persist before stream",
        e?.response?.status,
        e?.response?.data || e
      );
      setError(
        e?.response?.data?.detail ||
          e?.message ||
          "Failed to save conversation."
      );
      return;
    }

    setLoading(true);

    try {
      const res = await authorizedStreamFetch("/ask/stream", {
        method: "POST",
        body: JSON.stringify({
          conversation_id: conversationId,
          text,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `HTTP ${res.status}`);
      }

      if (!res.body) {
        throw new Error("Streaming response body is empty");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let gotDone = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let evt;
          try {
            evt = JSON.parse(trimmed);
          } catch {
            continue;
          }

          if (evt.event === "token") {
            updateConversationLocal(conversationId, (conv) => ({
              ...conv,
              updatedAt: new Date().toISOString(),
              messages: conv.messages.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, text: `${m.text || ""}${evt.text || ""}` }
                  : m
              ),
            }));
          } else if (evt.event === "done") {
            gotDone = true;

            const finalConversation = {
              ...(conversationsRef.current.find((c) => c.id === conversationId) ||
                optimisticConversation),
            };

            updateConversationLocal(conversationId, (conv) => ({
              ...conv,
              updatedAt: new Date().toISOString(),
              messages: conv.messages.map((m) =>
                m.id === assistantMessageId
                  ? {
                      ...m,
                      text: evt.output ?? m.text,
                      msgType: evt.type ?? "ask",
                      streaming: false,
                    }
                  : m
              ),
            }));

            setTimeout(async () => {
              try {
                const latest = conversationsRef.current.find(
                  (c) => c.id === conversationId
                );
                if (latest) await persistConversationObject(latest);
              } catch (e) {
                console.error(
                  "Failed to persist final streamed message",
                  e?.response?.status,
                  e?.response?.data || e
                );
                setError(
                  e?.response?.data?.detail ||
                    e?.message ||
                    "Failed to save final conversation."
                );
              }
            }, 0);
          } else if (evt.event === "error") {
            throw new Error(evt.detail || "Streaming failed");
          }
        }
      }

      if (!gotDone) {
        updateConversationLocal(conversationId, (conv) => ({
          ...conv,
          updatedAt: new Date().toISOString(),
          messages: conv.messages.map((m) =>
            m.id === assistantMessageId ? { ...m, streaming: false } : m
          ),
        }));

        try {
          const latest = conversationsRef.current.find(
            (c) => c.id === conversationId
          );
          if (latest) await persistConversationObject(latest);
        } catch (e) {
          console.error(
            "Failed to persist conversation after stream close",
            e?.response?.status,
            e?.response?.data || e
          );
        }
      }
    } catch (e) {
      const msg = e?.message || "Request failed. Check FastAPI/CORS/network.";

      setError(String(msg));

      updateConversationLocal(conversationId, (conv) => ({
        ...conv,
        updatedAt: new Date().toISOString(),
        messages: conv.messages.map((m) =>
          m.id === assistantMessageId
            ? {
                ...m,
                text: `Error: ${String(msg)}`,
                streaming: false,
              }
            : m
        ),
      }));

      try {
        const latest = conversationsRef.current.find((c) => c.id === conversationId);
        if (latest) await persistConversationObject(latest);
      } catch (persistErr) {
        console.error(
          "Failed to persist error state",
          persistErr?.response?.status,
          persistErr?.response?.data || persistErr
        );
      }
    } finally {
      setLoading(false);
    }
  }

  function resendLastUserMessage(conversationId) {
    const conv = conversationsRef.current.find((c) => c.id === conversationId);
    if (!conv || loading) return;

    const lastUserMessage = [...conv.messages]
      .reverse()
      .find((m) => m.role === "user" && String(m.text || "").trim());

    setActiveConversationId(conversationId);
    setError("");

    if (!lastUserMessage?.text) {
      if (isMobile) setMobileSidebarOpen(false);
      return;
    }

    setInput(lastUserMessage.text);
    if (isMobile) setMobileSidebarOpen(false);
  }

  async function uploadAudio() {
    if (!recBlob || loading) return;

    let conversation = activeConversation;

    try {
      if (!conversation) {
        const fresh = makeNewConversation();
        await api.post("/conversations", fresh);
        setConversations((prev) => upsertConversationInList(prev, fresh));
        setActiveConversationId(fresh.id);
        conversation = fresh;
      }
    } catch (e) {
      setError(
        e?.response?.data?.detail ||
          e?.message ||
          "Failed to create conversation."
      );
      return;
    }

    setError("");
    setLoading(true);

    try {
      const ext =
        recMime?.includes("mp4") || recMime?.includes("aac") ? "m4a" : "webm";

      const file = new File([recBlob], `recording.${ext}`, {
        type: recBlob.type || recMime || "application/octet-stream",
      });

      const form = new FormData();
      form.append("conversation_id", conversation.id);
      form.append("file", file);

      const res = await api.post("/audio", form, {
        timeout: 60000,
        headers: { "Content-Type": "multipart/form-data" },
      });

      const out = res.data?.output ?? "(no output)";
      const assistantMessage = {
        id: makeId("assistant"),
        role: "assistant",
        text: out,
        msgType: "audio",
        createdAt: new Date().toISOString(),
      };

      const updated = {
        ...conversation,
        title:
          conversation.title === "New Chat"
            ? "Audio conversation"
            : conversation.title,
        updatedAt: new Date().toISOString(),
        messages: [...conversation.messages, assistantMessage],
      };

      setConversations((prev) => upsertConversationInList(prev, updated));
      setActiveConversationId(updated.id);
      await persistConversationObject(updated);
    } catch (e) {
      const msg =
        e?.response?.data?.detail ||
        e?.message ||
        "Audio upload failed. Check FastAPI endpoint/CORS/network.";
      console.error(
        "Audio upload failed",
        e?.response?.status,
        e?.response?.data || e
      );
      setError(String(msg));
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey && !isMobile) {
      e.preventDefault();
      send();
    }
  }

  const sidebarStyle = isMobile
    ? {
        ...styles.sidebar,
        ...styles.sidebarMobile,
        transform: mobileSidebarOpen ? "translateX(0)" : "translateX(-100%)",
      }
    : {
        ...styles.sidebar,
        width: sidebarWidth,
      };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          {isMobile && (
            <button
              onClick={() => setMobileSidebarOpen(true)}
              style={styles.smallBtn}
              aria-label="Open conversations"
              title="Open conversations"
            >
              ☰
            </button>
          )}

          <div style={{ minWidth: 0 }}>
            <div style={styles.title}>CEO Assistant</div>
            <div style={styles.meta}>
              user_id: {requestUserId}{" "}
              {user?.username ? `• signed in as ${user.username}` : ""}
            </div>
          </div>
        </div>

        <button onClick={logout} style={styles.smallBtn}>
          Logout
        </button>
      </header>

      <div style={styles.body}>
        {isMobile && mobileSidebarOpen && (
          <div
            style={styles.mobileBackdrop}
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}

        <aside style={sidebarStyle}>
          <div style={styles.sidebarHeader}>
            <div style={styles.sidebarTitle}>Conversations</div>

            <div style={styles.sidebarTopActions}>
              <button onClick={createConversation} style={styles.smallBtn}>
                + New Chat
              </button>

              {isMobile && (
                <button
                  onClick={() => setMobileSidebarOpen(false)}
                  style={styles.smallBtn}
                  title="Close"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          <div style={styles.historyList}>
            {!historyLoaded && (
              <div style={{ opacity: 0.8, fontSize: 13 }}>Loading history...</div>
            )}

            {historyLoaded && conversations.length === 0 && (
              <div style={{ opacity: 0.7, fontSize: 13 }}>
                No conversations yet.
              </div>
            )}

            {conversations.map((conv) => {
              const active = conv.id === activeConversationId;
              const lastUserMessage =
                [...(conv.messages || [])]
                  .reverse()
                  .find((m) => m.role === "user")?.text || "";

              return (
                <div
                  key={conv.id}
                  style={{
                    ...styles.historyItem,
                    ...(active ? styles.historyItemActive : {}),
                  }}
                >
                  <button
                    style={styles.historyTextBtn}
                    onClick={() => openConversation(conv.id)}
                    title={conv.title}
                  >
                    <div style={styles.historyTitle}>{conv.title}</div>
                    <div style={styles.historyPreview}>
                      {lastUserMessage || "No messages yet"}
                    </div>
                  </button>

                  <div style={styles.historyActions}>
                    <button
                      style={styles.iconBtn}
                      onClick={() => resendLastUserMessage(conv.id)}
                      title="Reuse last message"
                    >
                      ↻
                    </button>
                    <button
                      style={styles.iconBtn}
                      onClick={() => renameConversation(conv.id)}
                      title="Rename"
                    >
                      ✎
                    </button>
                    <button
                      style={styles.iconBtnDanger}
                      onClick={() => deleteConversation(conv.id)}
                      title="Delete"
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {!isMobile && (
          <div
            style={styles.resizeHandle}
            onMouseDown={startResize}
            onDoubleClick={() => setSidebarWidth(320)}
            title="Drag to resize sidebar"
          />
        )}

        <main style={styles.main}>
          <div style={styles.chatArea} className="scroll-touch">
            {!activeConversation && historyLoaded && (
              <div style={styles.emptyState}>
                <div style={styles.emptyTitle}>No active conversation</div>
                <div style={styles.emptyText}>
                  Create a new chat or type a message to start one.
                </div>
                <button onClick={createConversation} style={styles.button}>
                  + New Chat
                </button>
              </div>
            )}

            {messages.map((m, idx) => (
              <div
                key={m.id || idx}
                style={{
                  ...styles.row,
                  justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                <div
                  style={{
                    ...styles.bubble,
                    ...(m.role === "user" ? styles.userBubble : styles.botBubble),
                  }}
                >
                  {m.role === "assistant" ? (
                    <div style={styles.markdownWrap} className="markdown-content">
                      {m.streaming && loading && idx === messages.length - 1 && (
                        <div className="blink-text">Thinking...</div>
                      )}

                      {!!m.text && (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {m.text}
                        </ReactMarkdown>
                      )}

                      {!m.streaming &&
                        (!m.msgType || m.msgType === "ask") &&
                        (() => {
                          const table = extractFirstGfmTable(m.text);
                          if (!table) return null;

                          const data = autoCoerceNumbers(table.headers, table.rows);
                          return (
                            <TableChart headers={table.headers} rows={data} />
                          );
                        })()}
                    </div>
                  ) : (
                    <pre style={styles.pre}>{m.text}</pre>
                  )}
                </div>
              </div>
            ))}

            <div ref={bottomRef} />
          </div>

          <div style={styles.recorder}>
            <div style={styles.recorderRow}>
              <div style={{ fontWeight: 600 }}>Audio</div>
              <div style={{ opacity: 0.8, fontSize: 12 }}>
                status: {recStatus} {recMime ? `• ${recMime}` : ""}
              </div>

              <button
                onClick={startRec}
                disabled={loading || recStatus === "recording"}
                style={styles.smallBtn}
              >
                🎙 Start
              </button>

              <button
                onClick={stopRec}
                disabled={loading || recStatus !== "recording"}
                style={styles.smallBtn}
              >
                ⏹ Stop
              </button>

              <button
                onClick={resetRec}
                disabled={loading || recStatus === "recording"}
                style={styles.smallBtn}
              >
                Reset
              </button>

              <button
                onClick={uploadAudio}
                disabled={loading || !recBlob || recStatus === "recording"}
                style={styles.smallBtn}
                title="Requires POST /audio on your FastAPI"
              >
                ⬆ Upload
              </button>
            </div>

            {recError && (
              <div style={{ color: "#ffb4b4", fontSize: 13 }}>{recError}</div>
            )}

            {recUrl && (
              <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                <audio controls src={recUrl} style={{ width: "100%" }} />
                <a
                  href={recUrl}
                  download={`recording.${
                    recMime?.includes("mp4") || recMime?.includes("aac")
                      ? "m4a"
                      : "webm"
                  }`}
                  style={{ fontSize: 13, color: "#9aa7ff" }}
                >
                  Download recording
                </a>
              </div>
            )}
          </div>

          <div style={styles.composer}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={
                isMobile
                  ? "Type message..."
                  : "Type message... (Enter = send, Shift+Enter = newline)"
              }
              style={styles.textarea}
              rows={isMobile ? 3 : 2}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              style={styles.button}
            >
              Send
            </button>
          </div>

          {error && <div style={styles.error}>{error}</div>}
        </main>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100dvh",
    width: "100%",
    display: "flex",
    flexDirection: "column",
    background: "#0b0f17",
    color: "#e6e6e6",
    overflow: "hidden",
  },

  header: {
    padding: "calc(12px + env(safe-area-inset-top, 0px)) 16px 12px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexShrink: 0,
    minWidth: 0,
  },

  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
    flex: 1,
  },

  title: {
    fontWeight: 700,
    fontSize: 16,
    lineHeight: 1.2,
  },

  meta: {
    opacity: 0.7,
    fontSize: 12,
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  },

  body: {
    flex: 1,
    display: "flex",
    minHeight: 0,
    position: "relative",
    overflow: "hidden",
    minWidth: 0,
  },

  sidebar: {
    borderRight: "1px solid rgba(255,255,255,0.08)",
    background: "#121826",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    flexShrink: 0,
    overflow: "hidden",
    zIndex: 20,
  },

  sidebarMobile: {
    position: "fixed",
    top: 0,
    left: 0,
    height: "100dvh",
    width: "84vw",
    maxWidth: 360,
    transition: "transform 0.25s ease",
    boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
    zIndex: 30,
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",
  },

  mobileBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    zIndex: 25,
  },

  resizeHandle: {
    width: 6,
    cursor: "col-resize",
    background: "rgba(255,255,255,0.08)",
    borderRight: "1px solid rgba(255,255,255,0.08)",
    borderLeft: "1px solid rgba(255,255,255,0.08)",
    flexShrink: 0,
  },

  sidebarHeader: {
    padding: "calc(12px + env(safe-area-inset-top, 0px)) 12px 12px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap",
  },

  sidebarTopActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },

  sidebarTitle: {
    fontWeight: 700,
    fontSize: 14,
    minWidth: 0,
  },

  historyList: {
    padding: 12,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minHeight: 0,
    WebkitOverflowScrolling: "touch",
  },

  historyItem: {
    display: "flex",
    gap: 8,
    alignItems: "stretch",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12,
    background: "rgba(255,255,255,0.04)",
    padding: 8,
    minWidth: 0,
  },

  historyItemActive: {
    background: "rgba(99,102,241,0.16)",
    border: "1px solid rgba(99,102,241,0.35)",
  },

  historyTextBtn: {
    flex: 1,
    textAlign: "left",
    background: "transparent",
    border: "none",
    color: "#e6e6e6",
    cursor: "pointer",
    padding: 2,
    minWidth: 0,
  },

  historyTitle: {
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 4,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  historyPreview: {
    fontSize: 12,
    opacity: 0.72,
    lineHeight: 1.35,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    overflowWrap: "anywhere",
  },

  historyActions: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    flexShrink: 0,
  },

  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.08)",
    color: "#e6e6e6",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 700,
    flexShrink: 0,
  },

  iconBtnDanger: {
    width: 30,
    height: 30,
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.08)",
    color: "#ffb4b4",
    cursor: "pointer",
    fontSize: 16,
    fontWeight: 700,
    flexShrink: 0,
  },

  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    minWidth: 0,
  },

  chatArea: {
    flex: 1,
    overflowY: "auto",
    padding: "16px",
    minHeight: 0,
    minWidth: 0,
    WebkitOverflowScrolling: "touch",
  },

  emptyState: {
    minHeight: "100%",
    display: "grid",
    placeContent: "center",
    gap: 10,
    textAlign: "center",
    opacity: 0.9,
  },

  emptyTitle: {
    fontSize: 20,
    fontWeight: 700,
  },

  emptyText: {
    fontSize: 14,
    opacity: 0.75,
  },

  row: {
    display: "flex",
    marginBottom: 12,
  },

  bubble: {
    minWidth: 0,
    maxWidth: "100%",
    borderRadius: 14,
    padding: "10px 12px",
    border: "1px solid rgba(255,255,255,0.08)",
  },

  userBubble: {
    background: "rgba(99, 102, 241, 0.18)",
    maxWidth: "88%",
  },

  botBubble: {
    background: "rgba(255, 255, 255, 0.06)",
    width: "100%",
  },

  pre: {
    margin: 0,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: 13,
    lineHeight: 1.4,
  },

  markdownWrap: {
    fontSize: 14,
    lineHeight: 1.55,
    overflowWrap: "anywhere",
    minWidth: 0,
  },

  recorder: {
    margin: "0 16px 12px 16px",
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    flexShrink: 0,
  },

  recorderRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },

  composer: {
    display: "flex",
    gap: 10,
    padding: "12px 16px calc(12px + env(safe-area-inset-bottom, 0px)) 16px",
    borderTop: "1px solid rgba(255,255,255,0.08)",
    background: "#0b0f17",
    flexShrink: 0,
    alignItems: "flex-end",
    minWidth: 0,
  },

  textarea: {
    flex: 1,
    resize: "none",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    outline: "none",
    background: "rgba(255,255,255,0.04)",
    color: "#e6e6e6",
    fontSize: 16,
    lineHeight: 1.35,
    minWidth: 0,
  },

  button: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.08)",
    color: "#e6e6e6",
    cursor: "pointer",
    fontWeight: 600,
    flexShrink: 0,
  },

  smallBtn: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.08)",
    color: "#e6e6e6",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 13,
    flexShrink: 0,
  },

  error: {
    padding: "8px 16px",
    color: "#ffb4b4",
    borderTop: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255, 0, 0, 0.06)",
    fontSize: 13,
    flexShrink: 0,
  },
};