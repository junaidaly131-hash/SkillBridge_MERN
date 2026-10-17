import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Bot,
  History,
  Loader2,
  Menu,
  MessageSquarePlus,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import apiClient from "../api/client";
import TutorMarkdown from "../components/AITutor/TutorMarkdown";
import ConfirmModal from "../components/Modal/ConfirmModal";

const SUGGESTIONS = [
  "Explain React hooks with examples.",
  "Help me prepare a lesson plan.",
  "Quiz me on JavaScript basics.",
  "Create a beginner learning plan.",
];

function makeRequestId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
}

function resetLabel(resetAt) {
  if (!resetAt) return "midnight UTC";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(resetAt));
}

function AITutorPage() {
  const [status, setStatus] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [draft, setDraft] = useState("");
  const [loadingPage, setLoadingPage] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pageError, setPageError] = useState("");
  const [sendError, setSendError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const scrollRef = useRef(null);
  const nearBottomRef = useRef(true);
  const composingRef = useRef(false);
  const selectedRef = useRef(null);

  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  const loadMessages = useCallback(async (conversationId) => {
    if (!conversationId) {
      setMessages([]);
      setHasMore(false);
      setNextCursor(null);
      return;
    }
    setLoadingMessages(true);
    setSendError("");
    try {
      const response = await apiClient.get(
        `/ai-tutor/conversations/${conversationId}/messages?limit=40`
      );
      if (selectedRef.current !== conversationId) return;
      setMessages(response.data.messages || []);
      setHasMore(Boolean(response.data.hasMore));
      setNextCursor(response.data.nextCursor || null);
      nearBottomRef.current = true;
      requestAnimationFrame(() => {
        const node = scrollRef.current;
        if (node) node.scrollTop = node.scrollHeight;
      });
    } catch (error) {
      setSendError(error.response?.data?.message || "Couldn't load this conversation.");
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function loadPage() {
      try {
        const [statusResponse, conversationsResponse] = await Promise.all([
          apiClient.get("/ai-tutor/status"),
          apiClient.get("/ai-tutor/conversations?page=1&limit=30"),
        ]);
        if (!active) return;
        setStatus(statusResponse.data);
        const rows = conversationsResponse.data.conversations || [];
        setConversations(rows);
        if (rows[0]) {
          selectedRef.current = rows[0].id;
          setSelectedId(rows[0].id);
          await loadMessages(rows[0].id);
        }
      } catch (error) {
        if (active) setPageError(error.response?.data?.message || "Couldn't load AI Tutor.");
      } finally {
        if (active) setLoadingPage(false);
      }
    }
    loadPage();
    return () => {
      active = false;
    };
  }, [loadMessages]);

  useEffect(() => {
    if (!nearBottomRef.current || loadingOlder) return;
    requestAnimationFrame(() => {
      const node = scrollRef.current;
      if (node) node.scrollTop = node.scrollHeight;
    });
  }, [messages, generating, loadingOlder]);

  const createConversation = async () => {
    setCreating(true);
    setSendError("");
    try {
      const response = await apiClient.post("/ai-tutor/conversations", {});
      const conversation = response.data.conversation;
      setConversations((current) => [conversation, ...current]);
      selectedRef.current = conversation.id;
      setSelectedId(conversation.id);
      setMessages([]);
      setHasMore(false);
      setNextCursor(null);
      setHistoryOpen(false);
      return conversation;
    } catch (error) {
      setSendError(error.response?.data?.message || "Couldn't start a new chat.");
      return null;
    } finally {
      setCreating(false);
    }
  };

  const selectConversation = (conversationId) => {
    if (conversationId === selectedId) {
      setHistoryOpen(false);
      return;
    }
    selectedRef.current = conversationId;
    setSelectedId(conversationId);
    setMessages([]);
    setHistoryOpen(false);
    loadMessages(conversationId);
  };

  const acceptConsent = async () => {
    setAccepting(true);
    setSendError("");
    try {
      await apiClient.post("/ai-tutor/consent", { accepted: true });
      setStatus((current) => ({ ...current, consentRequired: false }));
    } catch (error) {
      setSendError(error.response?.data?.message || "Couldn't save your acknowledgement.");
    } finally {
      setAccepting(false);
    }
  };

  const loadOlder = async () => {
    if (!selectedId || !hasMore || !nextCursor || loadingOlder) return;
    const node = scrollRef.current;
    const previousHeight = node?.scrollHeight || 0;
    setLoadingOlder(true);
    try {
      const response = await apiClient.get(
        `/ai-tutor/conversations/${selectedId}/messages?limit=40&before=${nextCursor}`
      );
      setMessages((current) => [...(response.data.messages || []), ...current]);
      setHasMore(Boolean(response.data.hasMore));
      setNextCursor(response.data.nextCursor || null);
      requestAnimationFrame(() => {
        if (node) node.scrollTop += node.scrollHeight - previousHeight;
      });
    } catch (error) {
      setSendError(error.response?.data?.message || "Couldn't load older messages.");
    } finally {
      setLoadingOlder(false);
    }
  };

  const sendMessage = async (overrideText) => {
    const text = String(overrideText ?? draft).trim();
    if (!text || generating || !status?.available || status?.consentRequired) return;
    if (text.length > (status?.limits?.maxInputChars || 4000)) return;

    let conversationId = selectedId;
    if (!conversationId) {
      const conversation = await createConversation();
      if (!conversation) return;
      conversationId = conversation.id;
    }

    const clientRequestId = makeRequestId();
    const temporaryId = `pending_${clientRequestId}`;
    const optimisticMessage = {
      id: temporaryId,
      role: "user",
      text,
      status: "pending",
      clientRequestId,
      createdAt: new Date().toISOString(),
    };
    try {
      sessionStorage.setItem(
        `aiTutor.pending.${clientRequestId}`,
        JSON.stringify({ conversationId, text })
      );
    } catch {
      // Server-side request IDs still protect against duplicates.
    }

    nearBottomRef.current = true;
    setMessages((current) => [...current, optimisticMessage]);
    setDraft("");
    setSendError("");
    setGenerating(true);

    try {
      const response = await apiClient.post(
        `/ai-tutor/conversations/${conversationId}/messages`,
        { text, clientRequestId }
      );
      const data = response.data;
      setMessages((current) => [
        ...current.filter((message) => message.id !== temporaryId),
        data.userMessage,
        data.assistantMessage,
      ]);
      setStatus((current) => ({ ...current, usage: data.usage || current.usage }));
      setConversations((current) => [
        data.conversation,
        ...current.filter((conversation) => conversation.id !== data.conversation.id),
      ]);
      try {
        sessionStorage.removeItem(`aiTutor.pending.${clientRequestId}`);
      } catch {
        // Non-critical storage cleanup.
      }
    } catch (error) {
      const data = error.response?.data;
      const failedMessage = data?.userMessage || { ...optimisticMessage, status: "failed" };
      setMessages((current) =>
        current.map((message) => (message.id === temporaryId ? failedMessage : message))
      );
      if (data?.usage) setStatus((current) => ({ ...current, usage: data.usage }));
      setSendError(data?.message || "Connection lost. Your text is still available to retry.");
    } finally {
      setGenerating(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/ai-tutor/conversations/${deleteTarget.id}`);
      const remaining = conversations.filter((conversation) => conversation.id !== deleteTarget.id);
      setConversations(remaining);
      if (selectedId === deleteTarget.id) {
        const next = remaining[0] || null;
        selectedRef.current = next?.id || null;
        setSelectedId(next?.id || null);
        setMessages([]);
        if (next) loadMessages(next.id);
      }
      setDeleteTarget(null);
    } catch (error) {
      setSendError(error.response?.data?.message || "Couldn't delete that conversation.");
    } finally {
      setDeleting(false);
    }
  };

  const handleComposerKeyDown = (event) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !composingRef.current &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      sendMessage();
    }
  };

  const maxInput = status?.limits?.maxInputChars || 4000;
  const quotaExhausted =
    status?.usage?.userRemaining === 0 || status?.usage?.globalRemaining === 0;
  const canSend =
    Boolean(draft.trim()) &&
    draft.trim().length <= maxInput &&
    !generating &&
    status?.available &&
    !status?.consentRequired &&
    !quotaExhausted;

  if (loadingPage) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center" aria-label="Loading AI Tutor">
        <Loader2 className="animate-spin text-teal" size={34} />
      </div>
    );
  }

  return (
    <div className="max-w-[1500px] mx-auto h-[calc(100vh-7rem)] lg:h-[calc(100vh-9rem)] min-h-[560px]">
      <div className="h-full bg-white border border-[#E5E5E5] rounded-2xl shadow-sm overflow-hidden flex relative">
        <aside
          className={`${historyOpen ? "flex" : "hidden"} md:flex absolute md:static inset-0 z-20 md:z-auto w-full md:w-72 lg:w-80 bg-white border-r border-[#E5E5E5] flex-col`}
        >
          <div className="p-4 border-b border-[#E5E5E5] flex items-center gap-2">
            <button
              type="button"
              onClick={createConversation}
              disabled={creating || !status?.available}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-dark-blue text-white px-4 py-3 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {creating ? <Loader2 className="animate-spin" size={17} /> : <MessageSquarePlus size={17} />}
              New chat
            </button>
            <button
              type="button"
              onClick={() => setHistoryOpen(false)}
              className="md:hidden p-2 text-gray hover:text-black"
              aria-label="Close conversation history"
            >
              <X size={22} />
            </button>
          </div>

          <div className="px-4 pt-4 pb-2 flex items-center gap-2 text-sm font-semibold text-gray">
            <History size={16} /> Conversation history
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-4">
            {conversations.length === 0 ? (
              <p className="px-3 py-8 text-sm text-gray text-center">No learning chats yet.</p>
            ) : (
              conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={`group flex items-start gap-2 rounded-xl mb-1 ${
                    selectedId === conversation.id ? "bg-light-teal" : "hover:bg-light-gray"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => selectConversation(conversation.id)}
                    className="min-w-0 flex-1 text-left px-3 py-3"
                  >
                    <span className="block text-sm font-medium text-black truncate">
                      {conversation.title}
                    </span>
                    <span className="block text-xs text-gray truncate mt-1">
                      {conversation.lastMessagePreview || "Start learning"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(conversation)}
                    className="mt-2 mr-2 p-2 text-gray hover:text-red-600 rounded-lg hover:bg-red-50 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100"
                    aria-label={`Delete ${conversation.title}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>

        <section className="flex-1 min-w-0 flex flex-col">
          <header className="h-16 shrink-0 px-4 sm:px-6 border-b border-[#E5E5E5] flex items-center justify-between gap-3">
            <div className="min-w-0 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                className="md:hidden p-2 -ml-2 text-gray hover:text-black"
                aria-label="Open conversation history"
              >
                <Menu size={22} />
              </button>
              <div className="w-9 h-9 rounded-xl bg-light-teal text-teal flex items-center justify-center shrink-0">
                <Sparkles size={19} />
              </div>
              <div className="min-w-0">
                <h1 className="font-bold text-black truncate">SkillBridge AI Tutor</h1>
                <p className="text-xs text-gray truncate">Learn, practise, plan, and prepare lessons</p>
              </div>
            </div>
            {status?.usage && (
              <div className="text-right shrink-0">
                <p className="text-xs sm:text-sm font-semibold text-dark-blue">
                  {status.usage.userRemaining} left today
                </p>
                <p className="hidden sm:block text-[11px] text-gray">
                  Resets {resetLabel(status.usage.resetAt)}
                </p>
              </div>
            )}
          </header>

          <div
            ref={scrollRef}
            onScroll={(event) => {
              const node = event.currentTarget;
              nearBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 120;
            }}
            className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-light-bg px-3 sm:px-6 py-5"
          >
            {hasMore && (
              <div className="text-center mb-5">
                <button
                  type="button"
                  onClick={loadOlder}
                  disabled={loadingOlder}
                  className="inline-flex items-center gap-2 text-xs font-medium text-teal hover:underline disabled:opacity-50"
                >
                  {loadingOlder && <Loader2 className="animate-spin" size={13} />}
                  Load older messages
                </button>
              </div>
            )}

            {pageError && (
              <div className="max-w-xl mx-auto mt-12 p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm flex gap-3">
                <AlertCircle className="shrink-0" size={19} /> {pageError}
              </div>
            )}

            {!status?.available && (
              <div className="max-w-xl mx-auto mt-12 text-center bg-white border border-[#E5E5E5] rounded-2xl p-7">
                <Bot className="mx-auto text-gray mb-3" size={38} />
                <h2 className="text-lg font-bold text-black mb-2">AI Tutor is unavailable</h2>
                <p className="text-sm text-gray">{status?.message || "Please try again later."}</p>
              </div>
            )}

            {status?.available && status?.consentRequired && (
              <div className="max-w-2xl mx-auto mt-6 bg-white border border-teal/30 rounded-2xl p-5 sm:p-6 shadow-sm">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="text-teal shrink-0 mt-0.5" size={22} />
                  <div>
                    <h2 className="font-bold text-black mb-2">Before your first AI Tutor message</h2>
                    <p className="text-sm text-gray leading-6 mb-3">
                      Your message and relevant recent AI Tutor conversation history are sent to
                      Google Gemini to generate a response. Under Google&apos;s free-tier terms,
                      submitted content may be used to improve Google products.
                    </p>
                    <p className="text-sm text-gray leading-6 mb-4">
                      Don&apos;t share personal, confidential, payment, identity, or account information.
                      AI can make mistakes, so verify important answers.
                    </p>
                    <div className="flex flex-wrap items-center gap-4">
                      <button
                        type="button"
                        onClick={acceptConsent}
                        disabled={accepting}
                        className="inline-flex items-center gap-2 rounded-lg bg-teal-button hover:bg-teal-button-hover text-white px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
                      >
                        {accepting && <Loader2 className="animate-spin" size={15} />}
                        I understand and continue
                      </button>
                      <a
                        href={status.termsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-teal underline underline-offset-2"
                      >
                        Read Google&apos;s Gemini API terms
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {status?.available && !status?.consentRequired && messages.length === 0 && !loadingMessages && (
              <div className="max-w-3xl mx-auto py-8 sm:py-14 text-center">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-light-teal text-teal flex items-center justify-center mb-4">
                  <Bot size={29} />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-black mb-2">What would you like to learn?</h2>
                <p className="text-sm text-gray mb-7">
                  Ask in English, Urdu, or Roman Urdu. You can also request a beginner,
                  intermediate, or advanced explanation.
                </p>
                <div className="grid sm:grid-cols-2 gap-3 text-left">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      type="button"
                      key={suggestion}
                      onClick={() => sendMessage(suggestion)}
                      className="p-4 rounded-xl bg-white border border-[#E5E5E5] text-sm text-black hover:border-teal hover:bg-light-teal transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {loadingMessages && (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="animate-spin text-teal" size={28} />
              </div>
            )}

            {!loadingMessages && messages.length > 0 && (
              <div className="max-w-4xl mx-auto space-y-5">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div className={`max-w-[92%] sm:max-w-[82%] ${message.role === "assistant" ? "flex gap-2.5" : ""}`}>
                      {message.role === "assistant" && (
                        <div className="w-8 h-8 shrink-0 rounded-lg bg-light-teal text-teal flex items-center justify-center mt-1">
                          <Bot size={17} />
                        </div>
                      )}
                      <div>
                        <div
                          className={`rounded-2xl px-4 py-3 text-sm break-words overflow-hidden ${
                            message.role === "user"
                              ? "bg-dark-blue text-white rounded-br-md"
                              : "bg-white border border-[#E5E5E5] text-black rounded-bl-md"
                          } ${message.status === "failed" ? "border-red-300" : ""}`}
                        >
                          {message.role === "assistant" ? (
                            <TutorMarkdown>{message.text}</TutorMarkdown>
                          ) : (
                            <p className="whitespace-pre-wrap leading-6">{message.text}</p>
                          )}
                        </div>
                        {message.status === "failed" && (
                          <div className="mt-2 flex items-center justify-end gap-2 text-xs text-red-600">
                            <span>Response failed.</span>
                            <button
                              type="button"
                              onClick={() => sendMessage(message.text)}
                              disabled={generating}
                              className="inline-flex items-center gap-1 font-semibold hover:underline disabled:opacity-50"
                            >
                              <RotateCcw size={12} /> Retry
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {generating && (
                  <div className="flex justify-start gap-2.5" aria-live="polite">
                    <div className="w-8 h-8 rounded-lg bg-light-teal text-teal flex items-center justify-center">
                      <Bot size={17} />
                    </div>
                    <div className="bg-white border border-[#E5E5E5] rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2 text-sm text-gray">
                      <Loader2 className="animate-spin text-teal" size={15} /> Thinking...
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-[#E5E5E5] bg-white px-3 sm:px-5 py-3">
            {quotaExhausted && (
              <div className="max-w-4xl mx-auto mb-2 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800" role="status">
                <AlertCircle className="shrink-0" size={14} />
                AI Tutor&apos;s daily allowance is used up. It resets at {resetLabel(status.usage.resetAt)}.
              </div>
            )}
            {sendError && (
              <div className="max-w-4xl mx-auto mb-2 flex items-start gap-2 text-xs text-red-600" role="alert">
                <AlertCircle className="shrink-0" size={14} /> {sendError}
              </div>
            )}
            <div className="max-w-4xl mx-auto">
              <div className="flex items-end gap-2 rounded-2xl border border-[#D0D0D0] focus-within:border-teal bg-light-gray px-3 py-2">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  onCompositionStart={() => {
                    composingRef.current = true;
                  }}
                  onCompositionEnd={() => {
                    composingRef.current = false;
                  }}
                  rows={1}
                  maxLength={maxInput}
                  disabled={!status?.available || status?.consentRequired || generating || quotaExhausted}
                  placeholder={
                    quotaExhausted
                      ? `Daily allowance used — resets ${resetLabel(status?.usage?.resetAt)}`
                      : status?.consentRequired
                      ? "Review the notice above to continue"
                      : "Ask AI Tutor anything about learning or teaching..."
                  }
                  className="flex-1 min-h-10 max-h-32 resize-none bg-transparent outline-none px-1 py-2 text-sm text-black disabled:cursor-not-allowed"
                  aria-label="Message AI Tutor"
                />
                <button
                  type="button"
                  onClick={() => sendMessage()}
                  disabled={!canSend}
                  className="w-10 h-10 shrink-0 rounded-xl bg-dark-blue text-white flex items-center justify-center hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Send message"
                >
                  {generating ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                </button>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-3 text-[11px] text-gray">
                <p>AI can make mistakes. Don&apos;t share personal or confidential information.</p>
                <p className="shrink-0">{draft.length}/{maxInput}</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete learning chat?"
        message="This removes the conversation and its messages from SkillBridge. It does not imply deletion of data already processed or retained by Google."
        confirmLabel="Delete chat"
        confirmingLabel="Deleting..."
        isConfirming={deleting}
      />
    </div>
  );
}

export default AITutorPage;
