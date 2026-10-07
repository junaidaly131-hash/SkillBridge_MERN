import { useEffect, useMemo, useState, useRef } from "react";
import { Phone, MoreVertical, Send, Smile, ArrowLeft, Trash2, CalendarPlus, Paperclip, FileText, Download, Loader2, MessageCircle, Wallet, Flag, Ban, ShieldCheck, Check, CheckCheck, Video } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { fetchMessages, upsertMessage, replaceMessage, markConversationAsRead, deleteConversation, sendAttachment } from "../../store/chatSlice";
import { blockUser, unblockUser, reportUser } from "../../store/profileSlice";
import { getSocket } from "../../socket";
import { useToast } from "../../ui/Toast";
import ReportUserModal from "../Modal/ReportUserModal";
import EmojiPicker from "emoji-picker-react";

const MAX_ATTACHMENT_SIZE = 15 * 1024 * 1024; // matches backend uploadChatAttachment limit
// Mirrors SchedulePanel.jsx - a call can be joined starting this many minutes
// before its scheduled start.
const JOIN_WINDOW_BEFORE_MINUTES = 10;

function formatFileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const URL_PATTERN = /(https?:\/\/[^\s]+)/g;

// Splits message text on URLs (e.g. the Jitsi join link in a meeting-invite
// message) and renders them as clickable links, leaving everything else as
// plain text. The regex has exactly one capturing group, so String.split
// alternates [text, url, text, url, ...] - odd indices are always the URLs.
function linkifyText(text) {
  const parts = text.split(URL_PATTERN);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="underline break-all"
        onClick={(e) => e.stopPropagation()}
      >
        {part}
      </a>
    ) : (
      part
    )
  );
}

function getMeetingInviteState(metadata, now) {
  if (!metadata?.meetingId || !metadata?.startsAt) return null;
  const startsAtMs = new Date(metadata.startsAt).getTime();
  const endsAtMs = startsAtMs + (metadata.duration || 60) * 60 * 1000;
  const joinOpensAtMs = startsAtMs - JOIN_WINDOW_BEFORE_MINUTES * 60 * 1000;
  return {
    meetingId: metadata.meetingId,
    joinUrl: metadata.joinUrl,
    canJoin: now >= joinOpensAtMs && now <= endsAtMs,
    isPast: now > endsAtMs,
  };
}

function ChatMessages({ chat, onBack, onScheduleClick, onOpenSchedulePanel }) {
  const [message, setMessage] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [isTogglingBlock, setIsTogglingBlock] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const menuRef = useRef(null);
  const emojiPickerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const toast = useToast();
  const { messagesByConversation, messagesLoading } = useSelector((state) => state.chat);
  const { user } = useSelector((state) => state.auth);
  const { profile } = useSelector((state) => state.profile);
  const { onlineUserIds, lastSeenByUser } = useSelector((state) => state.presence);

  const otherUserId = chat?.otherUserId;
  const isBlocked = Boolean(
    otherUserId && profile?.blockedUsers?.some((id) => String(id) === String(otherUserId))
  );

  const conversationId = chat?._id;
  const rawMessages = messagesByConversation[conversationId];
  const messages = rawMessages || [];
  // messagesByConversation only gets a key for this conversation once the
  // fetch resolves, so its absence (vs. an empty array) tells us whether
  // we're still waiting on the very first load.
  const isLoadingMessages = messagesLoading && rawMessages === undefined;

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const isOtherOnline = Boolean(otherUserId && onlineUserIds.includes(String(otherUserId)));

  // Format last seen time from real presence data (falls back to the
  // conversation's stored lastSeen if we haven't received a live update yet).
  const getLastSeenText = () => {
    if (isOtherOnline) return "Online";

    const lastSeenRaw = (otherUserId && lastSeenByUser[String(otherUserId)]) || chat?.otherUserLastSeen;
    if (!lastSeenRaw) return "Offline";

    const lastSeenTime = new Date(lastSeenRaw);
    const now = new Date();
    const diffMs = now - lastSeenTime;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Last seen just now";
    if (diffMins === 1) return "Last seen 1 min ago";
    if (diffMins < 60) return `Last seen ${diffMins} mins ago`;
    if (diffHours === 1) return "Last seen 1 hour ago";
    if (diffHours < 24) return `Last seen ${diffHours} hours ago`;
    if (diffDays === 1) return "Last seen yesterday";
    if (diffDays < 7) return `Last seen ${diffDays} days ago`;
    return `Last seen ${lastSeenTime.toLocaleDateString()}`;
  };

  useEffect(() => {
    if (!conversationId) return;
    dispatch(fetchMessages(conversationId));
    // Mark conversation as read when opened
    dispatch(markConversationAsRead(conversationId));

    const socket = getSocket();
    socket.emit("joinConversation", { conversationId });
    const onNew = ({ message: msg }) => {
      // The reducer will handle deduplication by ID
      dispatch(upsertMessage({ conversationId, message: msg }));
      
      // If message is from another user and conversation is currently open, mark as read
      const meId = user?.id;
      const isFromOther = String(msg.sender?._id || msg.sender?.id) !== String(meId);
      if (isFromOther && conversationId) {
        // Since conversation is open, mark it as read immediately
        dispatch(markConversationAsRead(conversationId));
      }
    };
    socket.on("newMessage", onNew);
    return () => {
      socket.off("newMessage", onNew);
    };
  }, [conversationId, dispatch, user, chat]);

  // Re-check join-window eligibility periodically so a meeting-invite bubble's
  // "Join" button enables itself live once the session comes within the join
  // window, without a page refresh (mirrors SchedulePanel.jsx).
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const displayMessages = useMemo(() => {
    const meId = user?.id;
    return (messages || []).map((m) => {
      const isOwn = String(m.sender?._id || m.sender?.id) === String(meId);
      const isRead = otherUserId && (m.readBy || []).map(String).includes(String(otherUserId));
      const isDelivered = isRead || (otherUserId && (m.deliveredTo || []).map(String).includes(String(otherUserId)));
      return {
        _id: m._id,
        text: m.text,
        time: new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        isOwn,
        status: isRead ? "read" : isDelivered ? "delivered" : "sent",
        isAttachment: m.messageType === "attachment",
        attachment: m.messageType === "attachment" ? m.metadata : null,
        isMeetingInvite: m.messageType === "meeting_invite",
        meetingInvite: m.messageType === "meeting_invite" ? getMeetingInviteState(m.metadata, now) : null,
      };
    });
  }, [messages, user, otherUserId, now]);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow selecting the same file again later
    if (!file) return;

    if (file.size > MAX_ATTACHMENT_SIZE) {
      toast.error(`File is too large. Max size is ${formatFileSize(MAX_ATTACHMENT_SIZE)}.`);
      return;
    }

    setIsUploadingFile(true);
    try {
      await dispatch(sendAttachment({ conversationId, file })).unwrap();
      // The message itself arrives via the socket broadcast.
    } catch (err) {
      toast.error(err || "Failed to send attachment");
    } finally {
      setIsUploadingFile(false);
    }
  };

  const handleSend = () => {
    if (message.trim()) {
      const socket = getSocket();
      const text = message.trim();
      const tempId = `tmp-${Date.now()}`;
      setMessage("");
      
      // optimistic add with temporary ID
      dispatch(
        upsertMessage({
          conversationId,
          message: {
            _id: tempId,
            text,
            createdAt: new Date().toISOString(),
            sender: { _id: user?.id, name: user?.name, avatar: user?.avatar },
          },
        })
      );
      
      socket.emit("sendMessage", { conversationId, text }, (ack) => {
        if (ack?.ok && ack?.message) {
          // Reconcile the temp bubble with the real, server-saved message by
          // its exact tempId - handles the broadcast-vs-ack race without
          // risking a duplicate (see replaceMessage in chatSlice.js).
          dispatch(
            replaceMessage({
              conversationId,
              tempId,
              message: ack.message,
            })
          );
        } else {
          // If failed, we could remove the temp message or show an error
          console.error("sendMessage failed", ack?.error);
          // Optionally remove the temp message on failure
          // dispatch(removeMessage({ conversationId, messageId: tempId }));
        }
      });
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleDeleteChat = () => {
    setShowMenu(false);
    setShowDeleteConfirm(true);
  };

  const handleReportClick = () => {
    setShowMenu(false);
    setShowReportModal(true);
  };

  const handleSubmitReport = async (reason) => {
    if (!otherUserId) return;
    setIsSubmittingReport(true);
    try {
      await dispatch(reportUser({ userId: otherUserId, reason, conversationId })).unwrap();
      toast.success("Report submitted. Our team will review it.");
      setShowReportModal(false);
    } catch (err) {
      toast.error(err || "Failed to submit report");
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const handleToggleBlock = async () => {
    if (!otherUserId) return;
    setShowMenu(false);
    setIsTogglingBlock(true);
    try {
      if (isBlocked) {
        await dispatch(unblockUser(otherUserId)).unwrap();
        toast.success(`${chat?.name || "User"} unblocked.`);
      } else {
        await dispatch(blockUser(otherUserId)).unwrap();
        toast.success(`${chat?.name || "User"} blocked. They can no longer message you.`);
      }
    } catch (err) {
      toast.error(err || "Failed to update block status");
    } finally {
      setIsTogglingBlock(false);
    }
  };

  const confirmDelete = () => {
    dispatch(deleteConversation(conversationId));
    setShowDeleteConfirm(false);
    onBack?.();
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!chat) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-light-bg min-w-0 gap-3">
        <div className="w-16 h-16 rounded-full bg-light-teal flex items-center justify-center">
          <MessageCircle className="text-teal" size={28} />
        </div>
        <p className="font-family-poppins text-gray">
          Select a conversation to start messaging
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-light-bg h-full min-w-0">
      {/* Header */}
      <div className="bg-white px-4 py-3 border-b border-[#E5E5E5] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="md:hidden p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="relative w-10 h-10 shrink-0">
            <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden">
              {chat.avatar ? (
                <img
                  src={chat.avatar}
                  alt={chat.name || 'User'}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <span className="text-gray font-medium">
                  {chat.name?.charAt(0) || chat.participants?.[0]?.name?.charAt(0) || 'U'}
                </span>
              )}
            </div>
            {isOtherOnline && (
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-white rounded-full" />
            )}
          </div>
          <div>
            <h3 className="font-family-poppins text-sm font-semibold text-black">
              {chat.name || chat.participants?.[0]?.name || 'Unknown User'}
            </h3>
            <p className="font-family-poppins text-xs text-gray">
              {getLastSeenText()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* <button className="p-2 hover:bg-gray-100 rounded-lg transition-all">
            <Phone className="text-gray" size={20} />
          </button> */}
          <button
            className="p-2 hover:bg-gray-100 rounded-lg transition-all"
            onClick={onScheduleClick}
            aria-label="Schedule session"
          >
            <CalendarPlus className="text-gray" size={20} />
          </button>
          <button
            className="lg:hidden p-2 hover:bg-gray-100 rounded-lg transition-all"
            onClick={onOpenSchedulePanel}
            aria-label="Balance and reminders"
          >
            <Wallet className="text-gray" size={20} />
          </button>
          <div className="relative" ref={menuRef}>
            <button
              className="p-2 hover:bg-gray-100 rounded-lg transition-all"
              onClick={() => setShowMenu(!showMenu)}
            >
              <MoreVertical className="text-gray" size={20} />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10 min-w-[180px]">
                <button
                  onClick={handleReportClick}
                  className="w-full px-4 py-2 text-left text-sm text-black hover:bg-gray-50 flex items-center gap-2 font-family-poppins"
                >
                  <Flag size={16} />
                  Report User
                </button>
                <button
                  onClick={handleToggleBlock}
                  disabled={isTogglingBlock}
                  className="w-full px-4 py-2 text-left text-sm text-black hover:bg-gray-50 flex items-center gap-2 font-family-poppins disabled:opacity-50"
                >
                  {isBlocked ? <ShieldCheck size={16} /> : <Ban size={16} />}
                  {isBlocked ? "Unblock User" : "Block User"}
                </button>
                <button
                  onClick={handleDeleteChat}
                  className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 font-family-poppins"
                >
                  <Trash2 size={16} />
                  Delete Chat
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
        {isLoadingMessages && (
          <div className="space-y-4 animate-pulse">
            {[
              { side: "start", width: "w-48" },
              { side: "end", width: "w-40" },
              { side: "start", width: "w-56" },
              { side: "end", width: "w-32" },
            ].map((bubble, i) => (
              <div key={i} className={`flex ${bubble.side === "end" ? "justify-end" : "justify-start"}`}>
                <div className={`h-14 ${bubble.width} rounded-2xl bg-gray-200`} />
              </div>
            ))}
          </div>
        )}

        {!isLoadingMessages && displayMessages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center gap-2 py-12">
            <div className="w-14 h-14 rounded-full bg-light-teal flex items-center justify-center">
              <MessageCircle className="text-teal" size={24} />
            </div>
            <p className="font-family-poppins text-sm font-medium text-black">No messages yet</p>
            <p className="font-family-poppins text-xs text-gray">Say hi to start the conversation 👋</p>
          </div>
        )}

        {!isLoadingMessages && displayMessages.map((msg) => (
          <div
            key={msg._id}
            className={`flex ${msg.isOwn ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[70%] rounded-2xl px-4 py-3 shadow-sm ${
                msg.isOwn
                  ? "bg-teal-button text-white rounded-br-sm"
                  : "bg-white text-black border border-[#E5E5E5] rounded-bl-sm"
              }`}
            >
              {msg.isAttachment && msg.attachment ? (
                msg.attachment.fileType?.startsWith("image/") ? (
                  <a href={msg.attachment.url} target="_blank" rel="noopener noreferrer">
                    <img
                      src={msg.attachment.url}
                      alt={msg.attachment.fileName}
                      className="max-w-full max-h-64 rounded-lg object-contain"
                    />
                  </a>
                ) : (
                  <a
                    href={msg.attachment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 bg-white/60 rounded-lg p-2 hover:bg-white transition-colors"
                  >
                    <div className="w-9 h-9 rounded-lg bg-dark-blue/10 flex items-center justify-center shrink-0">
                      <FileText className="text-dark-blue" size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-family-poppins text-sm text-black truncate max-w-40">
                        {msg.attachment.fileName}
                      </p>
                      <p className="font-family-poppins text-xs text-gray">
                        {formatFileSize(msg.attachment.fileSize)}
                      </p>
                    </div>
                    <Download className="text-gray shrink-0" size={16} />
                  </a>
                )
              ) : (
                <p className="font-family-poppins text-sm whitespace-pre-wrap">{linkifyText(msg.text)}</p>
              )}
              {msg.isMeetingInvite && msg.meetingInvite && !msg.meetingInvite.isPast && (
                <button
                  type="button"
                  disabled={!msg.meetingInvite.canJoin}
                  onClick={() => navigate(`/meetings/${msg.meetingInvite.meetingId}/call`)}
                  className={`mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-lg font-family-poppins text-sm font-semibold transition-all ${
                    msg.meetingInvite.canJoin
                      ? msg.isOwn
                        ? "bg-white text-teal hover:bg-white/90"
                        : "bg-teal-button text-white hover:bg-teal-button-hover"
                      : `${msg.isOwn ? "bg-white/20 text-white/70" : "bg-gray-100 text-gray"} cursor-not-allowed`
                  }`}
                >
                  <Video size={16} />
                  {msg.meetingInvite.canJoin ? "Join Meeting" : `Join opens ${JOIN_WINDOW_BEFORE_MINUTES} min before start`}
                </button>
              )}
              <div
                className={`flex items-center justify-end gap-1 mt-1 ${
                  msg.isOwn ? "text-white/70" : "text-gray"
                }`}
              >
                <span className="font-family-poppins text-xs">{msg.time}</span>
                {msg.isOwn && (
                  msg.status === "sent" ? (
                    <Check size={14} />
                  ) : (
                    <CheckCheck
                      size={14}
                      className={msg.status === "read" ? "text-sky-400" : ""}
                    />
                  )
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-white px-4 py-3 border-t border-[#E5E5E5] relative">
        <div className="flex items-center gap-3">
          <div className="relative" ref={emojiPickerRef}>
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-all"
            >
              <Smile className="text-gray" size={20} />
            </button>
            {showEmojiPicker && (
              <div className="absolute bottom-full left-0 mb-2 z-50">
                <EmojiPicker
                  onEmojiClick={(emojiObject) => {
                    setMessage((prev) => prev + emojiObject.emoji);
                    setShowEmojiPicker(false);
                  }}
                  width={320}
                  height={400}
                />
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelect}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingFile}
            className="p-2 hover:bg-gray-100 rounded-lg transition-all disabled:opacity-50"
            aria-label="Attach file"
          >
            {isUploadingFile ? (
              <Loader2 className="text-gray animate-spin" size={20} />
            ) : (
              <Paperclip className="text-gray" size={20} />
            )}
          </button>
          <input
            type="text"
            placeholder="Message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            className="flex-1 px-4 py-2.5 bg-light-gray rounded-full font-family-poppins text-sm outline-none"
          />
          <button
            onClick={handleSend}
            className="p-2 bg-dark-blue hover:bg-dark-blue/90 rounded-full transition-all"
          >
            <Send className="text-white" size={18} />
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm mx-4 shadow-xl">
            <h3 className="font-family-poppins text-lg font-semibold text-black mb-2">
              Delete Conversation
            </h3>
            <p className="font-family-poppins text-sm text-gray mb-4">
              Are you sure you want to delete this conversation? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm font-family-poppins text-gray hover:bg-gray-100 rounded-lg transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-sm font-family-poppins text-white bg-red-600 hover:bg-red-700 rounded-lg transition-all"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <ReportUserModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        onSubmit={handleSubmitReport}
        userName={chat?.name || "this user"}
        isSubmitting={isSubmittingReport}
      />
    </div>
  );
}

export default ChatMessages;
