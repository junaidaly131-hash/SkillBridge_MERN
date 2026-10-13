import { useEffect, useMemo, useState, useRef } from "react";
import { Phone, MoreVertical, Send, Smile, ArrowLeft, Trash2, CalendarPlus, Paperclip, FileText, Download, Loader2, MessageCircle, Wallet, Flag, Ban, ShieldCheck, Check, CheckCheck, Video, Pencil, SmilePlus, Archive, ArchiveRestore, ChevronDown, Copy, X as XIcon } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import {
  fetchMessages,
  fetchConversations,
  upsertMessage,
  replaceMessage,
  markConversationAsRead,
  deleteConversation,
  sendAttachment,
  setConversationArchived,
  editMessage,
  toggleReaction,
} from "../../store/chatSlice";
import { fetchMeetings, respondToMeeting } from "../../store/meetingsSlice";
import { blockUser, unblockUser, reportUser } from "../../store/profileSlice";
import { getSocket, onConnected } from "../../socket";
import { useToast } from "../../ui/Toast";
import ReportUserModal from "../Modal/ReportUserModal";
import EmojiPicker from "emoji-picker-react";

const MAX_ATTACHMENT_SIZE = 15 * 1024 * 1024; // matches backend uploadChatAttachment limit
// Mirrors SchedulePanel.jsx - a call can be joined starting this many minutes
// before its scheduled start.
const JOIN_WINDOW_BEFORE_MINUTES = 10;

// How long the other side's typing dots stay up with no further signal. Covers
// the case where their tab closes mid-word, so no stopTyping ever arrives.
const TYPING_STALE_MS = 4000;
// Idle gap after the last keystroke before we tell them we've stopped.
const TYPING_IDLE_MS = 1500;
// At most one `typing` emit per this interval, so holding a key down doesn't
// turn every character into a socket round trip.
const TYPING_THROTTLE_MS = 2000;
// Space a message-actions menu needs above its chevron to open upward.
const MENU_CLEARANCE = 150;
// Treat the view as "at the bottom" within this many pixels, so a few px of
// sub-pixel drift doesn't read as the user having scrolled up.
const NEAR_BOTTOM_PX = 120;

function formatFileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Mirrors backend/config/chat.js. Kept in step by the server, which rejects
// anything outside the list and anything past the window - this copy only
// decides what the UI offers.
const ALLOWED_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const EDIT_WINDOW_MS = 15 * 60 * 1000;

/**
 * Collapses a message's reactions into one chip per emoji.
 *
 * Each person holds at most one reaction, so a chip's count is a number of
 * people - "😂 3" with the chip tinted if you are one of the three.
 */
function groupReactions(reactions, meId) {
  const byEmoji = new Map();
  for (const r of reactions || []) {
    const current = byEmoji.get(r.emoji) || { emoji: r.emoji, count: 0, mine: false, names: [] };
    current.count += 1;
    if (String(r.user?._id || r.user) === String(meId)) current.mine = true;
    if (r.user?.name) current.names.push(r.user.name);
    byEmoji.set(r.emoji, current);
  }
  // Most-reacted first, so the bubble doesn't reshuffle as counts change.
  return [...byEmoji.values()].sort((a, b) => b.count - a.count);
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

/**
 * What the meeting-invite bubble should show.
 *
 * `metadata` is frozen at the moment the message was sent, so the live status
 * comes from the meetings store instead - a request that has since been
 * accepted, declined or withdrawn must not keep offering the same buttons.
 * A meeting that is no longer in that list is no longer upcoming, which is all
 * the bubble needs to know.
 */
function getMeetingInviteState(metadata, now, { liveMeeting, meetingsLoaded, meId }) {
  if (!metadata?.meetingId || !metadata?.startsAt) return null;

  const startsAtMs = new Date(metadata.startsAt).getTime();
  const endsAtMs = startsAtMs + (metadata.duration || 60) * 60 * 1000;
  const joinOpensAtMs = startsAtMs - JOIN_WINDOW_BEFORE_MINUTES * 60 * 1000;

  const status = liveMeeting?.status || (meetingsLoaded ? "gone" : metadata.status || "pending");
  const isPending = status === "pending";
  const createdByMe = liveMeeting
    ? String(liveMeeting.createdBy) === String(meId)
    : String(metadata.invitedUserId) !== String(meId);

  return {
    meetingId: metadata.meetingId,
    status,
    isPending,
    // Only the invited side answers. Shown from the live record where we have
    // one, falling back to who the invitation named.
    awaitingMyAnswer: isPending && !createdByMe,
    awaitingTheirAnswer: isPending && createdByMe,
    canJoin: status === "scheduled" && now >= joinOpensAtMs && now <= endsAtMs,
    isPast: now > endsAtMs,
  };
}

function ChatMessages({ chat, onBack, onDeleted, onScheduleClick, onOpenSchedulePanel }) {
  const [message, setMessage] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [isTogglingBlock, setIsTogglingBlock] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [otherIsTyping, setOtherIsTyping] = useState(false);
  const typingClearRef = useRef(null);
  const typingSentAtRef = useRef(0);
  const stopTypingRef = useRef(null);
  const menuRef = useRef(null);
  const emojiPickerRef = useRef(null);
  const reactionPickerRef = useRef(null);
  const messageMenuRef = useRef(null);
  const messagesEndRef = useRef(null);
  const messagesScrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const toast = useToast();
  const { messagesByConversation, messagesLoading } = useSelector((state) => state.chat);
  const { user } = useSelector((state) => state.auth);
  const { profile } = useSelector((state) => state.profile);
  const { onlineUserIds, lastSeenByUser } = useSelector((state) => state.presence);
  // Live status for meeting-invite bubbles. SchedulePanel loads this list; on
  // narrow screens that panel is a drawer and may never have been opened, so
  // this component fetches it too (fetchMeetings is idempotent).
  const { meetings } = useSelector((state) => state.meetings);
  const [meetingsLoaded, setMeetingsLoaded] = useState(false);
  const [respondingMeetingId, setRespondingMeetingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  // Which message has its reaction picker open, if any.
  const [reactingToId, setReactingToId] = useState(null);
  // Which message has its action menu open.
  const [menuForId, setMenuForId] = useState(null);
  // Whether that menu (and the emoji row) drops up or down. Decided per open:
  // both are absolutely positioned inside the scrolling message list, so one
  // that opens upward from a message near the top is clipped by the list's own
  // edge and ends up hidden behind the chat header, unreachable.
  const [menuDropsDown, setMenuDropsDown] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

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

  // Whether the view is already sitting at the latest message. Used to decide
  // if the typing indicator is worth scrolling for - yanking someone back down
  // while they are reading older messages is worse than them not seeing dots.
  const isNearBottom = () => {
    const el = messagesScrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
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

  // Switching chats closes anything half-open from the previous one.
  useEffect(() => {
    setEditingId(null);
    setReactingToId(null);
    setMenuForId(null);
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    dispatch(fetchMessages(conversationId));
    // Mark conversation as read when opened
    dispatch(markConversationAsRead(conversationId));

    const socket = getSocket();
    // Re-joined on every reconnect, not just once: Socket.IO rooms are tied to
    // the socket id, so a dropped connection silently leaves the conversation
    // room and read receipts and typing stop arriving with no sign of it.
    //
    // The refetch matters as much as the re-join. Edits and reactions arrive as
    // one-off `messageUpdated` events with nothing to replay them: anything
    // that happened while the socket was down is simply never seen, and the
    // thread sits there showing a message without the reaction somebody left on
    // it until the page is reloaded. Re-reading the thread on reconnect is the
    // only thing that closes that window - and it is a real one here, because a
    // sleeping free-tier backend drops every socket it holds.
    let first = true;
    const unsubscribeJoin = onConnected(() => {
      socket.emit("joinConversation", { conversationId });
      // Skipped on the initial connect, where the fetch below already runs.
      if (first) first = false;
      else dispatch(fetchMessages(conversationId));
    });
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
    // The other side's typing dots. Cleared on their stopTyping, and also by a
    // local timeout - if their tab closes mid-word no stopTyping ever arrives
    // and the dots would otherwise stay up forever.
    const onTyping = ({ conversationId: id }) => {
      if (String(id) !== String(conversationId)) return;
      setOtherIsTyping(true);
      clearTimeout(typingClearRef.current);
      typingClearRef.current = setTimeout(() => setOtherIsTyping(false), TYPING_STALE_MS);
    };
    const onStoppedTyping = ({ conversationId: id }) => {
      if (String(id) !== String(conversationId)) return;
      clearTimeout(typingClearRef.current);
      setOtherIsTyping(false);
    };

    socket.on("newMessage", onNew);
    socket.on("userTyping", onTyping);
    socket.on("userStoppedTyping", onStoppedTyping);
    return () => {
      unsubscribeJoin();
      socket.off("newMessage", onNew);
      socket.off("userTyping", onTyping);
      socket.off("userStoppedTyping", onStoppedTyping);
      clearTimeout(typingClearRef.current);
      setOtherIsTyping(false);
    };
  }, [conversationId, dispatch, user, chat]);

  // Keeps invite bubbles honest about what has actually been agreed, including
  // when the other side answers from their own browser.
  useEffect(() => {
    const socket = getSocket();
    const resync = () => {
      dispatch(fetchMeetings())
        .unwrap()
        .then(() => setMeetingsLoaded(true))
        .catch(() => {});
    };
    resync();
    socket.on("newMeeting", resync);
    socket.on("meetingUpdated", resync);
    const unsubscribe = onConnected(resync);
    return () => {
      socket.off("newMeeting", resync);
      socket.off("meetingUpdated", resync);
      unsubscribe();
    };
  }, [dispatch]);

  const handleStartEdit = (msg) => {
    setEditingId(msg._id);
    setEditText(msg.text || "");
    setReactingToId(null);
  };

  // True when there isn't room to open upward inside the scrolling list.
  // MENU_CLEARANCE covers the tallest panel (React + Edit + Copy).
  const shouldDropDown = (anchorEl) => {
    const list = messagesScrollRef.current;
    if (!list || !anchorEl) return false;
    return anchorEl.getBoundingClientRect().top - list.getBoundingClientRect().top < MENU_CLEARANCE;
  };

  const handleCopy = async (text) => {
    setMenuForId(null);
    try {
      await navigator.clipboard.writeText(text || "");
      toast.success("Copied.");
    } catch {
      // navigator.clipboard is unavailable on an insecure origin and can be
      // blocked by permissions, so this is a real path, not a theoretical one.
      toast.error("Couldn't copy that.");
    }
  };

  const handleSaveEdit = async () => {
    const text = editText.trim();
    if (!text || !editingId) return;

    // Nothing changed - close without a pointless request that would still
    // stamp the message "edited".
    const original = messages.find((m) => String(m._id) === String(editingId));
    if (original && original.text === text) {
      setEditingId(null);
      return;
    }

    setIsSavingEdit(true);
    try {
      await dispatch(editMessage({ conversationId, messageId: editingId, text })).unwrap();
      setEditingId(null);
    } catch (err) {
      toast.error(err || "Couldn't edit that message");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleToggleReaction = async (messageId, emoji) => {
    setReactingToId(null);
    try {
      await dispatch(toggleReaction({ conversationId, messageId, emoji })).unwrap();
    } catch (err) {
      toast.error(err || "Couldn't add that reaction");
    }
  };

  const handleToggleArchive = async () => {
    setShowMenu(false);
    try {
      await dispatch(
        setConversationArchived({ conversationId, archived: !chat?.archived })
      ).unwrap();
      toast.success(chat?.archived ? "Moved back to your inbox." : "Chat archived.");
      dispatch(fetchConversations());
    } catch (err) {
      toast.error(err || "Couldn't update this chat");
    }
  };

  const handleRespondToInvite = async (meetingId, decision) => {
    setRespondingMeetingId(meetingId);
    try {
      await dispatch(respondToMeeting({ meetingId, decision })).unwrap();
      toast.success(decision === "accept" ? "Session confirmed." : "Request declined.");
    } catch (err) {
      toast.error(err || "Couldn't send your answer");
      dispatch(fetchMeetings());
    } finally {
      setRespondingMeetingId(null);
    }
  };

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

  // The typing bubble is appended after the last message, so without this it
  // lands just below the visible area and is never seen - which is exactly how
  // it looked: the dots were rendering, only off-screen.
  useEffect(() => {
    if (otherIsTyping && isNearBottom()) scrollToBottom();
  }, [otherIsTyping]);

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
        editedAt: m.editedAt || null,
        canEdit:
          isOwn &&
          (m.messageType || "text") === "text" &&
          !String(m._id).startsWith("tmp-") &&
          now - new Date(m.createdAt).getTime() < EDIT_WINDOW_MS,
        // Grouped so each emoji shows once with a count, and so the button can
        // be highlighted when this user is one of the people who reacted.
        reactions: groupReactions(m.reactions, meId),
        isMeetingInvite: m.messageType === "meeting_invite",
        meetingInvite:
          m.messageType === "meeting_invite"
            ? getMeetingInviteState(m.metadata, now, {
                liveMeeting: (meetings || []).find(
                  (x) => String(x._id) === String(m.metadata?.meetingId)
                ),
                meetingsLoaded,
                meId,
              })
            : null,
      };
    });
  }, [messages, user, otherUserId, now, meetings, meetingsLoaded]);

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

  // Tells the other side we're typing, at most once every TYPING_THROTTLE_MS,
  // and schedules a stopTyping for when the keystrokes stop. Called from the
  // input's onChange rather than a key handler so pasting counts too.
  const signalTyping = () => {
    if (!conversationId) return;
    const socket = getSocket();

    if (Date.now() - typingSentAtRef.current > TYPING_THROTTLE_MS) {
      typingSentAtRef.current = Date.now();
      socket.emit("typing", { conversationId });
    }

    clearTimeout(stopTypingRef.current);
    stopTypingRef.current = setTimeout(() => {
      typingSentAtRef.current = 0;
      socket.emit("stopTyping", { conversationId });
    }, TYPING_IDLE_MS);
  };

  // Sending is itself a reason to stop: the message arriving while the dots are
  // still showing looks like they're about to say something else.
  const clearTypingSignal = () => {
    clearTimeout(stopTypingRef.current);
    typingSentAtRef.current = 0;
    if (conversationId) getSocket().emit("stopTyping", { conversationId });
  };

  // Leaving the chat (or unmounting) should take the dots down on their side.
  useEffect(() => () => clearTimeout(stopTypingRef.current), []);

  const handleSend = () => {
    if (message.trim()) {
      const socket = getSocket();
      const text = message.trim();
      const tempId = `tmp-${Date.now()}`;
      setMessage("");
      clearTypingSignal();
      
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

  const confirmDelete = async () => {
    setShowDeleteConfirm(false);
    try {
      await dispatch(deleteConversation(conversationId)).unwrap();
      // Tells the page to drop its selection - this pane is now showing a
      // conversation the user no longer has.
      onDeleted?.();
    } catch (err) {
      toast.error(err || "Couldn't delete this chat");
    }
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
      // The picker sits inside the hover-actions wrapper, which also holds the
      // button that opens it - so a click on that button lands inside the ref
      // and is left alone, and anything else closes it.
      if (reactionPickerRef.current && !reactionPickerRef.current.parentElement?.contains(event.target)) {
        setReactingToId(null);
      }
      if (messageMenuRef.current && !messageMenuRef.current.contains(event.target)) {
        setMenuForId(null);
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
                  onClick={handleToggleArchive}
                  className="w-full px-4 py-2 text-left text-sm text-black hover:bg-gray-50 flex items-center gap-2 font-family-poppins"
                >
                  {chat?.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                  {chat?.archived ? "Move to Inbox" : "Archive Chat"}
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
      <div ref={messagesScrollRef} className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
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
            // Extra space below a bubble that carries reactions, since the
            // chip hangs past its bottom edge and would otherwise sit on top
            // of the next message.
            className={`group flex ${msg.isOwn ? "justify-end" : "justify-start"} ${
              msg.reactions.length > 0 ? "mb-2" : ""
            }`}
          >
            <div
              className={`relative max-w-[70%] rounded-2xl px-4 py-3 shadow-sm ${
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
                <div className="mt-2">
                  {/* The invited side is the only one who can answer. Nothing
                      about this session happens - no call, no credits - until
                      they do. */}
                  {msg.meetingInvite.awaitingMyAnswer ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={respondingMeetingId === msg.meetingInvite.meetingId}
                        onClick={() => handleRespondToInvite(msg.meetingInvite.meetingId, "accept")}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg font-family-poppins text-sm font-semibold transition-all disabled:opacity-50 ${
                          msg.isOwn ? "bg-white text-teal hover:bg-white/90" : "bg-teal-button text-white hover:bg-teal-button-hover"
                        }`}
                      >
                        <Check size={16} />
                        Accept
                      </button>
                      <button
                        type="button"
                        disabled={respondingMeetingId === msg.meetingInvite.meetingId}
                        onClick={() => handleRespondToInvite(msg.meetingInvite.meetingId, "decline")}
                        className={`flex-1 py-2 rounded-lg font-family-poppins text-sm font-semibold transition-all disabled:opacity-50 ${
                          msg.isOwn
                            ? "bg-white/20 text-white hover:bg-white/30"
                            : "bg-gray-100 text-gray hover:bg-gray-200"
                        }`}
                      >
                        Decline
                      </button>
                    </div>
                  ) : msg.meetingInvite.awaitingTheirAnswer ? (
                    <p
                      className={`text-center py-2 rounded-lg font-family-poppins text-xs ${
                        msg.isOwn ? "bg-white/20 text-white/80" : "bg-gray-100 text-gray"
                      }`}
                    >
                      Waiting for a response
                    </p>
                  ) : msg.meetingInvite.status === "scheduled" ? (
                    <button
                      type="button"
                      disabled={!msg.meetingInvite.canJoin}
                      onClick={() => navigate(`/meetings/${msg.meetingInvite.meetingId}/call`)}
                      className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg font-family-poppins text-sm font-semibold transition-all ${
                        msg.meetingInvite.canJoin
                          ? msg.isOwn
                            ? "bg-white text-teal hover:bg-white/90"
                            : "bg-teal-button text-white hover:bg-teal-button-hover"
                          : `${msg.isOwn ? "bg-white/20 text-white/70" : "bg-gray-100 text-gray"} cursor-not-allowed`
                      }`}
                    >
                      <Video size={16} />
                      {msg.meetingInvite.canJoin
                        ? "Join Meeting"
                        : `Join opens ${JOIN_WINDOW_BEFORE_MINUTES} min before start`}
                    </button>
                  ) : (
                    <p
                      className={`text-center py-2 rounded-lg font-family-poppins text-xs ${
                        msg.isOwn ? "bg-white/20 text-white/80" : "bg-gray-100 text-gray"
                      }`}
                    >
                      {msg.meetingInvite.status === "declined"
                        ? "Declined"
                        : "This request is no longer active"}
                    </p>
                  )}
                </div>
              )}
              {/* Reactions sit ON the bubble's bottom edge, half outside it,
                  rather than inside the text block - inside, they pushed the
                  timestamp down and read as part of the message. Anchored to
                  the side the bubble came from, so they never cover its tail.
                  Clicking one you are part of removes yours. */}
              {msg.reactions.length > 0 && (
                <div
                  className={`absolute -bottom-2 flex flex-wrap gap-0.5 ${
                    msg.isOwn ? "right-2" : "left-2"
                  }`}
                >
                  {msg.reactions.map((r) => (
                    <button
                      key={r.emoji}
                      type="button"
                      onClick={() => handleToggleReaction(msg._id, r.emoji)}
                      title={r.names.join(", ")}
                      // Light background and the same #E5E5E5 hairline every
                      // other card and bubble in the app uses - a solid teal
                      // outline read as a button to press rather than a tally
                      // of who reacted. Your own reaction is marked by the
                      // tint, not by a heavier border.
                      className={`flex items-center gap-0.5 rounded-full px-1.5 py-[3px] leading-none shadow-sm transition-colors border border-[#E5E5E5] ${
                        r.mine ? "bg-light-teal text-teal" : "bg-white text-gray"
                      }`}
                    >
                      <span className="text-[11px]">{r.emoji}</span>
                      <span className="font-family-poppins text-[10px]">{r.count}</span>
                    </button>
                  ))}
                </div>
              )}

              <div
                className={`flex items-center justify-end gap-1 mt-1 ${
                  msg.isOwn ? "text-white/70" : "text-gray"
                }`}
              >
                {msg.editedAt && (
                  <span className="font-family-poppins text-xs italic mr-0.5">edited</span>
                )}
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

            {/* One chevron beside the bubble, the way WhatsApp does it, rather
                than a row of icons - two bare icons gave no clue what they did
                and crowded short messages. It opens a labelled menu instead.
                Always visible on touch, where there is no hover to reveal it. */}
            {!String(msg._id).startsWith("tmp-") && (
              <div
                ref={menuForId === msg._id ? messageMenuRef : null}
                className={`relative flex items-center gap-0.5 self-end pb-1 ${
                  msg.isOwn ? "order-first mr-1" : "ml-1"
                } ${
                  menuForId === msg._id || reactingToId === msg._id
                    ? "opacity-100"
                    : "opacity-100 md:opacity-0 md:group-hover:opacity-100"
                } transition-opacity`}
              >
                {/* Reacting keeps its own button - it is the one thing people
                    do often enough that burying it behind a menu costs a click
                    every time. The chevron holds the rest. */}
                <button
                  type="button"
                  onClick={(e) => {
                    setMenuForId(null);
                    if (reactingToId !== msg._id) setMenuDropsDown(shouldDropDown(e.currentTarget));
                    setReactingToId(reactingToId === msg._id ? null : msg._id);
                  }}
                  aria-label="React to message"
                  className="p-1 rounded-full text-gray hover:text-black hover:bg-gray-100"
                >
                  <SmilePlus size={15} />
                </button>
                {(msg.canEdit || !msg.isAttachment) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      setReactingToId(null);
                      if (menuForId !== msg._id) setMenuDropsDown(shouldDropDown(e.currentTarget));
                      setMenuForId(menuForId === msg._id ? null : msg._id);
                    }}
                    aria-label="Message actions"
                    className="p-1 rounded-full text-gray hover:text-black hover:bg-gray-100"
                  >
                    <ChevronDown size={16} />
                  </button>
                )}

                {menuForId === msg._id && (
                  <div
                    className={`absolute z-30 min-w-36 bg-white border border-[#E5E5E5] rounded-lg shadow-lg py-1 ${
                      menuDropsDown ? "top-full mt-1" : "bottom-full mb-1"
                    } ${msg.isOwn ? "left-0" : "right-0"}`}
                  >
                    {msg.canEdit && (
                      <button
                        type="button"
                        onClick={() => {
                          setMenuForId(null);
                          handleStartEdit(msg);
                        }}
                        className="w-full px-3 py-2 text-left text-sm text-black hover:bg-gray-50 flex items-center gap-2 font-family-poppins"
                      >
                        <Pencil size={15} />
                        Edit
                      </button>
                    )}
                    {!msg.isAttachment && (
                      <button
                        type="button"
                        onClick={() => handleCopy(msg.text)}
                        className="w-full px-3 py-2 text-left text-sm text-black hover:bg-gray-50 flex items-center gap-2 font-family-poppins"
                      >
                        <Copy size={15} />
                        Copy
                      </button>
                    )}
                  </div>
                )}

                {reactingToId === msg._id && (
                  <div
                    ref={reactionPickerRef}
                    className={`absolute z-30 flex items-center gap-0.5 bg-white border border-[#E5E5E5] rounded-full shadow-lg px-1.5 py-1 ${
                      menuDropsDown ? "top-full mt-1" : "bottom-full mb-1"
                    } ${msg.isOwn ? "left-0" : "right-0"}`}
                  >
                    {ALLOWED_REACTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => handleToggleReaction(msg._id, emoji)}
                        className="text-base leading-none p-1 rounded-full hover:bg-gray-100 transition-colors"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {otherIsTyping && (
          <div className="flex justify-start">
            <div
              className="bg-white border border-[#E5E5E5] rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm"
              role="status"
              aria-label={`${chat.name || "They"} is typing`}
            >
              <span className="flex items-center gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-gray typing-dot"
                    // Staggered so the three dots travel as a wave rather than
                    // bouncing in unison.
                    style={{ animationDelay: `${i * 160}ms` }}
                  />
                ))}
              </span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-white px-3 sm:px-4 py-3 border-t border-[#E5E5E5] relative">
        {/* gap-2 on phones: with gap-3 the three buttons plus their gaps left
            too little for the input, which (see min-w-0 below) then pushed the
            send button off the right edge. */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="relative shrink-0" ref={emojiPickerRef}>
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
            className="shrink-0 p-2 hover:bg-gray-100 rounded-lg transition-all disabled:opacity-50"
            aria-label="Attach file"
          >
            {isUploadingFile ? (
              <Loader2 className="text-gray animate-spin" size={20} />
            ) : (
              <Paperclip className="text-gray" size={20} />
            )}
          </button>
          {/* min-w-0 is what actually fixes the missing send button. An <input>
              has an intrinsic minimum width from its default `size`, and
              flex-1 alone cannot shrink a child below its min-content width -
              so on a narrow phone the input held its ground and the send
              button was pushed outside the row. */}
          <input
            type="text"
            placeholder="Message"
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              signalTyping();
            }}
            onBlur={clearTypingSignal}
            onKeyPress={handleKeyPress}
            className="flex-1 min-w-0 px-4 py-2.5 bg-light-gray rounded-full font-family-poppins text-sm outline-none"
          />
          <button
            onClick={handleSend}
            aria-label="Send message"
            className="shrink-0 p-2.5 bg-dark-blue hover:bg-dark-blue/90 rounded-full transition-all"
          >
            <Send className="text-white" size={18} />
          </button>
        </div>
      </div>

      {/* Edit, as its own dialog rather than an input inside the bubble. In the
          bubble the field inherited the bubble's width - so a short message
          gave you a field too narrow to read what you were correcting - and on
          an own-message it was white text on teal, which is hard to edit in. */}
      {editingId && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 modal-overlay-enter" onClick={() => setEditingId(null)} />
          <div className="relative w-full max-w-lg bg-white rounded-xl shadow-xl modal-content-enter">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E5E5E5]">
              <button
                onClick={() => setEditingId(null)}
                className="p-1.5 -ml-1.5 text-gray hover:text-black hover:bg-gray-100 rounded-lg transition-all"
                aria-label="Cancel editing"
              >
                <XIcon size={20} />
              </button>
              <h3 className="font-family-poppins text-base font-semibold text-black">Edit message</h3>
            </div>

            {/* The message as it stands, so you can see what you are changing. */}
            <div className="px-4 py-5 bg-light-bg flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-sm px-4 py-3 shadow-sm bg-teal-button text-white">
                <p className="font-family-poppins text-sm whitespace-pre-wrap wrap-break-word">
                  {editText || " "}
                </p>
              </div>
            </div>

            <div className="flex items-end gap-2 px-4 py-3 border-t border-[#E5E5E5]">
              <textarea
                value={editText}
                autoFocus
                rows={1}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSaveEdit();
                  }
                  if (e.key === "Escape") setEditingId(null);
                }}
                className="flex-1 min-w-0 max-h-32 px-4 py-2.5 bg-light-gray rounded-2xl font-family-poppins text-sm outline-none resize-none"
              />
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={!editText.trim() || isSavingEdit}
                aria-label="Save changes"
                className="shrink-0 p-2.5 bg-teal-button hover:bg-teal-button-hover rounded-full transition-all disabled:opacity-50"
              >
                {isSavingEdit ? (
                  <Loader2 className="text-white animate-spin" size={18} />
                ) : (
                  <Check className="text-white" size={18} />
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm mx-4 shadow-xl">
            <h3 className="font-family-poppins text-lg font-semibold text-black mb-2">
              Delete Conversation
            </h3>
            <p className="font-family-poppins text-sm text-gray mb-4">
              This clears the chat for you only — {chat?.name || "the other person"} keeps their
              copy. If they message you again, the chat comes back with the new messages.
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
