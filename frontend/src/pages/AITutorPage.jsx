import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Bot,
  BookOpen,
  CheckCircle2,
  FileText,
  History,
  Loader2,
  Menu,
  MessageSquarePlus,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import apiClient from "../api/client";
import TutorMarkdown from "../components/AITutor/TutorMarkdown";
import StudyToolsPanel from "../components/AITutor/StudyToolsPanel";
import ConfirmModal from "../components/Modal/ConfirmModal";
import { useToast } from "../ui/Toast";

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

function documentStatusLabel(document) {
  if (document.status === "ready") return `${document.chunkCount} indexed sections`;
  if (document.status === "processing") return "Extracting and indexing...";
  if (document.status === "deleting") return "Deletion pending — click delete to retry";
  const labels = {
    DOCUMENT_SCANNED_OR_EMPTY: "No extractable text found",
    PDF_PASSWORD_PROTECTED: "Password-protected PDF",
    PDF_MALFORMED: "PDF could not be read",
    DOCUMENT_INVALID_UTF8: "TXT is not valid UTF-8",
    PROCESS_RESTARTED: "Processing was interrupted",
  };
  return labels[document.failureCategory] || "Processing failed";
}

function AITutorPage() {
  const { error: showError } = useToast();
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
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [chatMode, setChatMode] = useState("general");
  const [documents, setDocuments] = useState([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState(null);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [documentDeleteTarget, setDocumentDeleteTarget] = useState(null);
  const [sourceDrawer, setSourceDrawer] = useState(null);
  const [loadingSource, setLoadingSource] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState("chat");

  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const sourceCloseRef = useRef(null);
  const nearBottomRef = useRef(true);
  const composingRef = useRef(false);
  const selectedRef = useRef(null);

  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    if (!sourceDrawer) return undefined;
    sourceCloseRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setSourceDrawer(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [sourceDrawer]);

  const loadMessages = useCallback(async (conversationId) => {
    if (!conversationId) {
      setMessages([]);
      setHasMore(false);
      setNextCursor(null);
      return;
    }
    setLoadingMessages(true);
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
      showError(error.response?.data?.message || "Couldn't load this conversation.");
    } finally {
      setLoadingMessages(false);
    }
  }, [showError]);

  useEffect(() => {
    let active = true;
    async function loadPage() {
      try {
        const [statusResponse, conversationsResponse, documentsResponse] = await Promise.all([
          apiClient.get("/ai-tutor/status"),
          apiClient.get("/ai-tutor/conversations?page=1&limit=30"),
          apiClient.get("/ai-tutor/documents"),
        ]);
        if (!active) return;
        setStatus(statusResponse.data);
        const rows = conversationsResponse.data.conversations || [];
        setConversations(rows);
        const documentRows = documentsResponse.data.documents || [];
        setDocuments(documentRows);
        const firstReadyDocument = documentRows.find((document) => document.status === "ready");
        setSelectedDocumentId(firstReadyDocument?.id || null);
        if (rows[0]) {
          selectedRef.current = rows[0].id;
          setSelectedId(rows[0].id);
          setChatMode(rows[0].mode || "general");
          if (rows[0].document?.id) setSelectedDocumentId(rows[0].document.id);
          await loadMessages(rows[0].id);
        }
      } catch (error) {
        if (active) showError(error.response?.data?.message || "Couldn't load AI Tutor.");
      } finally {
        if (active) setLoadingPage(false);
      }
    }
    loadPage();
    return () => {
      active = false;
    };
  }, [loadMessages, showError]);

  useEffect(() => {
    if (!documents.some((document) => document.status === "processing")) return undefined;
    const timer = window.setInterval(async () => {
      try {
        const response = await apiClient.get("/ai-tutor/documents");
        setDocuments(response.data.documents || []);
      } catch {
        // The page-level controls remain usable; the next poll can recover.
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [documents]);

  useEffect(() => {
    if (!nearBottomRef.current || loadingOlder) return;
    requestAnimationFrame(() => {
      const node = scrollRef.current;
      if (node) node.scrollTop = node.scrollHeight;
    });
  }, [messages, generating, loadingOlder]);

  const createConversation = async () => {
    setCreating(true);
    try {
      const body =
        chatMode === "document"
          ? { mode: "document", documentId: selectedDocumentId }
          : {};
      const response = await apiClient.post("/ai-tutor/conversations", body);
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
      showError(error.response?.data?.message || "Couldn't start a new chat.");
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
    const conversation = conversations.find((item) => item.id === conversationId);
    setWorkspaceTab("chat");
    setChatMode(conversation?.mode || "general");
    if (conversation?.document?.id) setSelectedDocumentId(conversation.document.id);
    setSelectedId(conversationId);
    setMessages([]);
    setHistoryOpen(false);
    loadMessages(conversationId);
  };

  const switchChatMode = (mode) => {
    setChatMode(mode);
    setWorkspaceTab("chat");
    const first = conversations.find((conversation) => (conversation.mode || "general") === mode);
    selectedRef.current = first?.id || null;
    setSelectedId(first?.id || null);
    setMessages([]);
    if (first) {
      if (first.document?.id) setSelectedDocumentId(first.document.id);
      loadMessages(first.id);
    }
  };

  const uploadDocument = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || uploadingDocument) return;
    const maxBytes = status?.limits?.documentMaxFileBytes || 5 * 1024 * 1024;
    const extension = file.name.toLowerCase().split(".").pop();
    if (!["pdf", "txt"].includes(extension)) {
      showError("Only text-based PDF and UTF-8 TXT files are supported.");
      return;
    }
    if (file.size > maxBytes) {
      showError(`Choose a file smaller than ${Math.round(maxBytes / 1024 / 1024)} MiB.`);
      return;
    }
    setUploadingDocument(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await apiClient.post("/ai-tutor/documents", body, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const document = response.data.document;
      setDocuments((current) => [document, ...current.filter((item) => item.id !== document.id)]);
      setSelectedDocumentId(document.id);
      setChatMode("document");
      setSelectedId(null);
      setMessages([]);
    } catch (error) {
      showError(error.response?.data?.message || "Couldn't process that document.");
      try {
        const response = await apiClient.get("/ai-tutor/documents");
        setDocuments(response.data.documents || []);
      } catch {
        // Keep the original actionable upload error.
      }
    } finally {
      setUploadingDocument(false);
    }
  };

  const confirmDocumentDelete = async () => {
    if (!documentDeleteTarget) return;
    setDeleting(true);
    try {
      const response = await apiClient.delete(`/ai-tutor/documents/${documentDeleteTarget.id}`);
      const removedConversations = new Set(response.data.deletedConversationIds || []);
      const remainingDocuments = documents.filter((document) => document.id !== documentDeleteTarget.id);
      const remainingConversations = conversations.filter(
        (conversation) => !removedConversations.has(conversation.id)
      );
      setDocuments(remainingDocuments);
      setConversations(remainingConversations);
      if (selectedDocumentId === documentDeleteTarget.id) {
        setSelectedDocumentId(
          remainingDocuments.find((document) => document.status === "ready")?.id || null
        );
      }
      if (removedConversations.has(selectedId)) {
        selectedRef.current = null;
        setSelectedId(null);
        setMessages([]);
      }
      setDocumentDeleteTarget(null);
    } catch (error) {
      // A previous request may have completed on the server even if its
      // response was lost. Reconcile with the server instead of leaving a
      // stale card that can never be selected or deleted.
      try {
        const [documentsResponse, conversationsResponse] = await Promise.all([
          apiClient.get("/ai-tutor/documents"),
          apiClient.get("/ai-tutor/conversations?page=1&limit=30"),
        ]);
        const serverDocuments = documentsResponse.data.documents || [];
        const serverConversations = conversationsResponse.data.conversations || [];
        setDocuments(serverDocuments);
        setConversations(serverConversations);
        if (!serverDocuments.some((document) => document.id === documentDeleteTarget.id)) {
          if (selectedDocumentId === documentDeleteTarget.id) {
            setSelectedDocumentId(
              serverDocuments.find((document) => document.status === "ready")?.id || null
            );
          }
          if (!serverConversations.some((conversation) => conversation.id === selectedId)) {
            selectedRef.current = null;
            setSelectedId(null);
            setMessages([]);
          }
          setDocumentDeleteTarget(null);
          return;
        }
      } catch {
        // Preserve the original deletion error when reconciliation also fails.
      }
      showError(error.response?.data?.message || "Couldn't delete that document.");
    } finally {
      setDeleting(false);
    }
  };

  const openSource = async (message, source) => {
    setLoadingSource(true);
    setSourceDrawer({ sourceId: source.sourceId, label: source.label, loading: true });
    try {
      const response = await apiClient.get(
        `/ai-tutor/conversations/${selectedId}/messages/${message.id}/sources/${source.chunkId}`
      );
      setSourceDrawer(response.data);
    } catch (error) {
      setSourceDrawer(null);
      showError(error.response?.data?.message || "Couldn't load that source excerpt.");
    } finally {
      setLoadingSource(false);
    }
  };

  const openStudySource = async (endpoint, source) => {
    setLoadingSource(true);
    setSourceDrawer({ sourceId: source.sourceId, label: source.label, loading: true });
    try {
      const response = await apiClient.get(endpoint);
      setSourceDrawer(response.data);
    } catch (error) {
      setSourceDrawer(null);
      showError(error.response?.data?.message || "Couldn't load that source excerpt.");
    } finally {
      setLoadingSource(false);
    }
  };

  const acceptConsent = async () => {
    setAccepting(true);
    try {
      await apiClient.post("/ai-tutor/consent", { accepted: true });
      setStatus((current) => ({ ...current, consentRequired: false }));
    } catch (error) {
      showError(error.response?.data?.message || "Couldn't save your acknowledgement.");
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
      showError(error.response?.data?.message || "Couldn't load older messages.");
    } finally {
      setLoadingOlder(false);
    }
  };

  const sendMessage = async (overrideText) => {
    const text = String(overrideText ?? draft).trim();
    if (!text || generating || !status?.available || status?.consentRequired || quotaExhausted) return;
    if (chatMode === "document" && !selectedDocumentId) {
      showError("Choose a ready document before starting a document chat.");
      return;
    }
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
      showError(data?.message || "Connection lost. Your text is still available to retry.");
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
      showError(error.response?.data?.message || "Couldn't delete that conversation.");
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
  const selectedDocument = documents.find((document) => document.id === selectedDocumentId) || null;
  const canSend =
    Boolean(draft.trim()) &&
    draft.trim().length <= maxInput &&
    !generating &&
    status?.available &&
    !status?.consentRequired &&
    !quotaExhausted &&
    (chatMode !== "document" || selectedDocument?.status === "ready");
  const visibleConversations = conversations.filter(
    (conversation) => (conversation.mode || "general") === chatMode
  );

  useEffect(() => {
    if (!quotaExhausted || !nearBottomRef.current) return;
    requestAnimationFrame(() => {
      const node = scrollRef.current;
      if (node) node.scrollTop = node.scrollHeight;
    });
  }, [quotaExhausted]);

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
          <div className="p-4 border-b border-[#E5E5E5]">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-light-gray p-1 mb-3" aria-label="Chat type">
              <button
                type="button"
                onClick={() => switchChatMode("general")}
                className={`rounded-lg px-2 py-2 text-xs font-semibold transition-colors ${
                  chatMode === "general" ? "bg-white text-dark-blue shadow-sm" : "text-gray hover:text-black"
                }`}
              >
                General chat
              </button>
              <button
                type="button"
                onClick={() => switchChatMode("document")}
                disabled={!status?.documentRag?.enabled}
                className={`rounded-lg px-2 py-2 text-xs font-semibold transition-colors disabled:opacity-45 ${
                  chatMode === "document" ? "bg-white text-teal shadow-sm" : "text-gray hover:text-black"
                }`}
              >
                Document chat
              </button>
            </div>
            {chatMode === "document" && (
              <div className="mb-3 space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,application/pdf,text/plain"
                  onChange={uploadDocument}
                  className="sr-only"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingDocument || status?.consentRequired}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-teal/35 bg-light-teal px-3 py-2.5 text-xs font-semibold text-teal hover:border-teal disabled:opacity-50"
                >
                  {uploadingDocument ? <Loader2 className="animate-spin" size={15} /> : <Upload size={15} />}
                  {uploadingDocument ? "Extracting and indexing..." : "Upload private PDF or TXT"}
                </button>
                <p className="text-[10px] leading-4 text-gray px-1">
                  Up to {Math.round((status?.limits?.documentMaxFileBytes || 5242880) / 1024 / 1024)} MiB.
                  Text-based PDFs only.
                </p>
                <div className="max-h-40 overflow-y-auto custom-scrollbar space-y-1">
                  {documents.map((document) => (
                    <div
                      key={document.id}
                      className={`group flex items-center gap-2 rounded-lg border px-2 py-2 ${
                        selectedDocumentId === document.id
                          ? "border-teal/40 bg-light-teal"
                          : "border-transparent hover:bg-light-gray"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (document.status !== "ready") return;
                          setSelectedDocumentId(document.id);
                          setSelectedId(null);
                          setMessages([]);
                          setWorkspaceTab("chat");
                        }}
                        disabled={document.status !== "ready"}
                        className="flex-1 min-w-0 text-left disabled:cursor-default"
                      >
                        <span className="flex items-center gap-1.5 text-xs font-medium text-black">
                          <FileText size={13} className="shrink-0 text-teal" />
                          <span className="truncate">{document.displayName}</span>
                        </span>
                        <span className="block mt-1 text-[10px] text-gray capitalize">
                          {documentStatusLabel(document)}
                        </span>
                      </button>
                      {document.status === "failed" && (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="text-[10px] font-semibold text-teal hover:underline"
                        >
                          Upload again
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setDocumentDeleteTarget(document)}
                        className="p-1.5 rounded-md text-gray hover:text-red-600 hover:bg-red-50"
                        aria-label={`Delete ${document.displayName}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={createConversation}
              disabled={
                creating ||
                !status?.available ||
                quotaExhausted ||
                (chatMode === "document" && selectedDocument?.status !== "ready")
              }
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-dark-blue text-white px-4 py-3 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {creating ? <Loader2 className="animate-spin" size={17} /> : <MessageSquarePlus size={17} />}
              {chatMode === "document" ? "New document chat" : "New chat"}
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
          </div>

          <div className="px-4 pt-4 pb-2 flex items-center gap-2 text-sm font-semibold text-gray">
            <History size={16} /> Conversation history
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-4">
            {visibleConversations.length === 0 ? (
              <p className="px-3 py-8 text-sm text-gray text-center">
                {chatMode === "document" ? "No document chats yet." : "No learning chats yet."}
              </p>
            ) : (
              visibleConversations.map((conversation) => (
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
                <p className="text-xs text-gray truncate">
                  {chatMode === "document" && selectedDocument
                    ? selectedDocument.displayName
                    : "Learn, practise, plan, and prepare lessons"}
                </p>
              </div>
            </div>
            {status?.usage && (
              <div className="text-right shrink-0">
                <p className={`text-xs sm:text-sm font-semibold ${quotaExhausted ? "text-teal" : "text-dark-blue"}`}>
                  {quotaExhausted ? "Daily limit reached" : `${status.usage.userRemaining} left today`}
                </p>
                <p className="hidden sm:block text-[11px] text-gray">
                  Resets {resetLabel(status.usage.resetAt)}
                </p>
              </div>
            )}
          </header>

          {chatMode === "document" && selectedDocument?.status === "ready" && status?.studyTools?.enabled && (
            <nav className="shrink-0 border-b border-[#E5E5E5] bg-white px-3 sm:px-6" aria-label="Document learning tools">
              <div className="flex gap-1 overflow-x-auto py-2">
                {[
                  ["chat", "Chat"],
                  ["summary", "Summary"],
                  ["quiz", "Practice quiz"],
                ].map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    onClick={() => {
                      setWorkspaceTab(value);
                    }}
                    aria-current={workspaceTab === value ? "page" : undefined}
                    className={`shrink-0 rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
                      workspaceTab === value ? "bg-light-teal text-teal" : "text-gray hover:bg-light-gray hover:text-black"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </nav>
          )}

          <div
            ref={scrollRef}
            onScroll={(event) => {
              const node = event.currentTarget;
              nearBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 120;
            }}
            className={`${workspaceTab === "chat" ? "flex-1" : "hidden"} min-h-0 overflow-y-auto custom-scrollbar bg-light-bg px-3 sm:px-6 py-5`}
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
                      Google Gemini to generate a response. If you upload a document, its text is
                      extracted and sent to Google for embeddings. Relevant excerpts are sent again
                      for document answers and practice quizzes; a requested summary may send bounded
                      sections covering the document. Under Google&apos;s free-tier terms, submitted content may be used
                      to improve Google products and may be reviewed by people.
                    </p>
                    <p className="text-sm text-gray leading-6 mb-4">
                      Upload only material you have permission to use. Don&apos;t upload personal,
                      confidential, payment, identity, verification, or account information. AI can
                      make mistakes, so verify important answers.
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

            {status?.available && !status?.consentRequired && !quotaExhausted && messages.length === 0 && !loadingMessages && chatMode === "general" && (
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

            {status?.available && !status?.consentRequired && !quotaExhausted && messages.length === 0 && !loadingMessages && chatMode === "document" && (
              <div className="max-w-3xl mx-auto py-8 sm:py-14 text-center">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-light-teal text-teal flex items-center justify-center mb-4">
                  <BookOpen size={28} />
                </div>
                {selectedDocument?.status === "ready" ? (
                  <>
                    <h2 className="text-xl sm:text-2xl font-bold text-black mb-2">Ask about this document</h2>
                    <p className="text-sm text-gray mb-3 break-words">{selectedDocument.displayName}</p>
                    <p className="text-xs text-gray max-w-xl mx-auto leading-5">
                      Answers use only retrieved excerpts from this selected document. Source references
                      appear below grounded answers.
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="text-xl sm:text-2xl font-bold text-black mb-2">Choose a private document</h2>
                    <p className="text-sm text-gray max-w-xl mx-auto leading-6">
                      Upload a text-based PDF or UTF-8 TXT file, then select it to start a grounded chat.
                    </p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-5 inline-flex items-center gap-2 rounded-xl bg-teal-button hover:bg-teal-button-hover px-5 py-3 text-sm font-semibold text-white"
                    >
                      <Upload size={16} /> Upload document
                    </button>
                  </>
                )}
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
                        {message.role === "assistant" && message.sources?.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2" aria-label="Answer sources">
                            {message.sources.map((source) => (
                              <button
                                type="button"
                                key={`${message.id}-${source.sourceId}`}
                                onClick={() => openSource(message, source)}
                                className="inline-flex items-center gap-1.5 rounded-full border border-teal/30 bg-light-teal px-2.5 py-1 text-[11px] font-semibold text-teal hover:border-teal"
                              >
                                <FileText size={12} /> {source.sourceId} - {source.label}
                              </button>
                            ))}
                          </div>
                        )}
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

          {chatMode === "document" && workspaceTab !== "chat" && selectedDocument?.status === "ready" && (
            <div className="flex flex-1 min-h-0 flex-col">
              <StudyToolsPanel
                mode={workspaceTab}
                documentId={selectedDocument.id}
                enabled={Boolean(status?.studyTools?.enabled)}
                quotaExhausted={quotaExhausted}
                onUsage={(usage) => usage && setStatus((current) => ({ ...current, usage }))}
                onSource={openStudySource}
              />
            </div>
          )}

          <div className={`${workspaceTab === "chat" ? "block" : "hidden"} shrink-0 border-t border-[#E5E5E5] bg-white px-3 sm:px-5 py-3`}>
            {chatMode === "document" && selectedDocument?.status === "ready" && !quotaExhausted && (
              <div className="max-w-4xl mx-auto mb-2 flex items-center gap-2 text-[11px] text-teal">
                <CheckCircle2 size={13} className="shrink-0" />
                Grounded in {selectedDocument.displayName}; general-knowledge fallback is disabled.
              </div>
            )}
            <div className="max-w-4xl mx-auto">
              {quotaExhausted ? (
                <div
                  className="flex items-start gap-3 rounded-2xl border border-teal/25 bg-light-teal px-4 py-3 text-dark-blue"
                  role="status"
                >
                  <AlertCircle className="mt-0.5 shrink-0 text-teal" size={18} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">Daily AI Tutor limit reached</p>
                    <p className="mt-0.5 text-xs leading-5 text-gray">
                      You can continue this chat after {resetLabel(status?.usage?.resetAt)}.
                    </p>
                  </div>
                </div>
              ) : (
                <>
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
                      disabled={
                        !status?.available ||
                        status?.consentRequired ||
                        generating ||
                        (chatMode === "document" && selectedDocument?.status !== "ready")
                      }
                      placeholder={
                        status?.consentRequired
                          ? "Review notice to continue"
                          : chatMode === "document"
                            ? selectedDocument?.status === "ready"
                              ? "Ask about the selected document..."
                              : "Choose a ready document first"
                            : "Ask AI Tutor..."
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
                </>
              )}
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

      <ConfirmModal
        isOpen={Boolean(documentDeleteTarget)}
        onClose={() => setDocumentDeleteTarget(null)}
        onConfirm={confirmDocumentDelete}
        title="Delete private document?"
        message={`This permanently removes the indexed excerpts and every AI Tutor chat linked to ${documentDeleteTarget?.displayName || "this document"}. SkillBridge does not retain the original upload. Deletion here does not imply deletion of data already processed by Google.`}
        confirmLabel="Delete document and chats"
        confirmingLabel="Deleting..."
        isConfirming={deleting}
      />

      {sourceDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Document source">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setSourceDrawer(null)}
            aria-label="Close source"
          />
          <aside className="relative z-10 h-full w-full max-w-md bg-white shadow-2xl flex flex-col">
            <header className="px-5 py-4 border-b border-[#E5E5E5] flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-teal">{sourceDrawer.sourceId}</p>
                <h2 className="font-bold text-black truncate">{sourceDrawer.filename || "Document source"}</h2>
                <p className="text-xs text-gray mt-1">{sourceDrawer.label}</p>
              </div>
              <button
                ref={sourceCloseRef}
                type="button"
                onClick={() => setSourceDrawer(null)}
                className="p-2 rounded-lg text-gray hover:bg-light-gray hover:text-black"
                aria-label="Close source excerpt"
              >
                <X size={20} />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto p-5 bg-light-bg">
              {loadingSource || sourceDrawer.loading ? (
                <div className="h-full flex items-center justify-center">
                  <Loader2 className="animate-spin text-teal" size={28} />
                </div>
              ) : (
                <div className="rounded-2xl border border-[#E5E5E5] bg-white p-4">
                  <p className="text-xs font-semibold text-gray mb-3">Stored excerpt</p>
                  <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-black">
                    {sourceDrawer.excerpt}
                  </pre>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

export default AITutorPage;
