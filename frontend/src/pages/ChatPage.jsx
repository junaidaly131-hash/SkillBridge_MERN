import { useState, useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import ChatList from "../components/Chat/ChatList";
import ChatMessages from "../components/Chat/ChatMessages";
import SchedulePanel from "../components/Chat/SchedulePanel";
import ScheduleSessionModal from "../components/Modal/ScheduleSessionModal";
import {
  fetchConversations,
  upsertMessage,
  updateUnreadCount,
  markMessagesDelivered,
  markMessagesReadReceipt,
  setTyping,
  applyMessageUpdate,
} from "../store/chatSlice";
import { setOnlineUsers, userWentOnline, userWentOffline } from "../store/presenceSlice";
import { getSocket } from "../socket";

// How long a row keeps showing "typing..." with no further signal.
const TYPING_STALE_MS = 4000;

function ChatPage() {
  const dispatch = useDispatch();
  const location = useLocation();
  const { conversations } = useSelector((state) => state.chat);
  const { user } = useSelector((state) => state.auth);
  const [selectedChat, setSelectedChat] = useState(null);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [schedulePanelDrawerOpen, setSchedulePanelDrawerOpen] = useState(false);

  useEffect(() => {
    dispatch(fetchConversations());
  }, [dispatch]);

  // Global socket listener for new messages (to update unread counts for closed conversations)
  useEffect(() => {
    const socket = getSocket();
    const meId = user?.id;
    
    const onNewMessage = ({ message: msg }) => {
      const msgConversationId = msg.conversation?._id || msg.conversation;
      if (!msgConversationId) return;
      
      const isFromOther = String(msg.sender?._id || msg.sender?.id) !== String(meId);
      const isNotSelected = selectedChat?._id !== msgConversationId;
      
      // If message is from another user and conversation is not currently open, increment unread count
      if (isFromOther && isNotSelected) {
        const conv = conversations.find(c => c._id === msgConversationId);
        if (conv) {
          const currentUnread = conv.unreadCount || 0;
          dispatch(updateUnreadCount({ conversationId: msgConversationId, unreadCount: currentUnread + 1 }));
        } else {
          // If conversation not in list yet, set unread to 1
          dispatch(updateUnreadCount({ conversationId: msgConversationId, unreadCount: 1 }));
        }
      }
      
      // Upsert the message (ChatMessages will also handle it if conversation is open, but reducer handles duplicates)
      dispatch(upsertMessage({ conversationId: msgConversationId, message: msg }));
    };
    
    socket.on("newMessage", onNewMessage);
    return () => {
      socket.off("newMessage", onNewMessage);
    };
  }, [dispatch, user, selectedChat, conversations]);

  // Presence (online/offline) and delivered/read tick updates - global for as
  // long as the chat page is mounted, independent of which chat is open.
  useEffect(() => {
    const socket = getSocket();

    const onOnlineUsers = ({ userIds }) => dispatch(setOnlineUsers(userIds));
    const onUserOnline = ({ userId }) => dispatch(userWentOnline(userId));
    const onUserOffline = ({ userId, lastSeen }) => dispatch(userWentOffline({ userId, lastSeen }));
    const onMessagesDelivered = ({ conversationId, userId }) =>
      dispatch(markMessagesDelivered({ conversationId, userId }));
    const onMessagesRead = ({ conversationId, readerId }) =>
      dispatch(markMessagesReadReceipt({ conversationId, readerId }));

    socket.on("onlineUsers", onOnlineUsers);
    socket.on("userOnline", onUserOnline);
    socket.on("userOffline", onUserOffline);
    // Typing is relayed to personal rooms, so it arrives for every
    // conversation - including ones not open - which is what lets the list row
    // show it. Each conversation gets its own stale-timeout, because a tab that
    // closes mid-word never sends stopTyping.
    const typingTimers = {};
    const onTyping = ({ conversationId }) => {
      if (!conversationId) return;
      dispatch(setTyping({ conversationId, typing: true }));
      clearTimeout(typingTimers[conversationId]);
      typingTimers[conversationId] = setTimeout(
        () => dispatch(setTyping({ conversationId, typing: false })),
        TYPING_STALE_MS
      );
    };
    const onStoppedTyping = ({ conversationId }) => {
      if (!conversationId) return;
      clearTimeout(typingTimers[conversationId]);
      dispatch(setTyping({ conversationId, typing: false }));
    };

    // An edit or a reaction from either side.
    const onMessageUpdated = ({ message: msg }) => {
      const conversationId = msg?.conversation?._id || msg?.conversation;
      if (!conversationId) return;
      dispatch(applyMessageUpdate({ conversationId, message: msg }));
    };
    socket.on("messagesDelivered", onMessagesDelivered);
    socket.on("messagesRead", onMessagesRead);
    socket.on("userTyping", onTyping);
    socket.on("userStoppedTyping", onStoppedTyping);
    socket.on("messageUpdated", onMessageUpdated);

    return () => {
      socket.off("onlineUsers", onOnlineUsers);
      socket.off("userOnline", onUserOnline);
      socket.off("userOffline", onUserOffline);
      socket.off("messagesDelivered", onMessagesDelivered);
      socket.off("messagesRead", onMessagesRead);
      socket.off("userTyping", onTyping);
      socket.off("userStoppedTyping", onStoppedTyping);
      socket.off("messageUpdated", onMessageUpdated);
      Object.values(typingTimers).forEach(clearTimeout);
    };
  }, [dispatch]);

  // Format conversations with name and avatar from participants
  const formattedConversations = useMemo(() => {
    const meId = user?.id;
    return (conversations || []).map((c) => {
      const other = (c.participants || []).find((p) => String(p._id || p.id) !== String(meId));
      return {
        ...c,
        name: other?.name || "Conversation",
        avatar: other?.avatar || null,
        otherUserId: other?._id || other?.id,
        otherUserLastSeen: other?.lastSeen || null,
      };
    });
  }, [conversations, user]);

  useEffect(() => {
    async function selectFromNavigationState() {
      // If navigating from dashboard with conversationId, select that conversation
      if (location.state?.conversationId) {
        const conversation = formattedConversations.find(
          (c) => c._id === location.state.conversationId
        );
        if (conversation) {
          setSelectedChat(conversation);
          setShowMobileChat(true);
          // e.g. from the AI Recommendations "Schedule" button, which creates the
          // conversation first and asks to jump straight into scheduling.
          if (location.state?.openSchedule) {
            setScheduleModalOpen(true);
          }
        }
      }
    }
    selectFromNavigationState();
  }, [location.state, formattedConversations]);

  const handleSelectChat = (chat) => {
    setSelectedChat(chat);
    // null means "nothing is selected any more" - deleting the open chat from
    // the list calls this. Opening the thread pane on a phone to show an empty
    // state would just hide the list they were looking at.
    setShowMobileChat(Boolean(chat));
  };

  const handleBack = () => {
    setShowMobileChat(false);
  };

  // Deleting clears the conversation for this user, so the thread pane must let
  // go of it. Without this, `selectedChat` still pointed at the cleared
  // conversation on desktop and the pane carried on showing it.
  const handleDeleted = () => {
    setSelectedChat(null);
    setShowMobileChat(false);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden h-[calc(100vh-120px)] lg:h-[calc(100vh-144px)]">
      <div className="flex h-full">
        {/* Chat List - Hidden on mobile when chat is selected */}
        <div
          className={`${
            showMobileChat ? "hidden md:flex" : "flex"
          } w-full md:w-auto`}
        >
          <ChatList
            selectedChat={selectedChat}
            onSelectChat={handleSelectChat}
            onToggleMobile={() => setShowMobileChat(true)}
          />
        </div>

        {/* Chat Messages - Full width on mobile when selected */}
        <div
          className={`${
            showMobileChat ? "flex" : "hidden md:flex"
          } flex-1 min-w-0`}
        >
          <ChatMessages
            chat={selectedChat}
            onBack={handleBack}
            onDeleted={handleDeleted}
            onScheduleClick={() => setScheduleModalOpen(true)}
            onOpenSchedulePanel={() => setSchedulePanelDrawerOpen(true)}
          />
        </div>

        {/* Schedule Panel - persistent column on desktop */}
        <div className="hidden lg:flex">
          <SchedulePanel onScheduleClick={() => setScheduleModalOpen(true)} />
        </div>
      </div>

      {/* Schedule Panel - slide-in drawer below desktop, opened from the
          chat header's wallet icon, so balance/reminders stay reachable at
          every screen size instead of just disappearing below lg. */}
      {schedulePanelDrawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/50 modal-overlay-enter"
            onClick={() => setSchedulePanelDrawerOpen(false)}
          />
          <div className="relative w-80 max-w-[85vw] h-full shadow-xl drawer-slide-in">
            <SchedulePanel
              onScheduleClick={() => {
                setSchedulePanelDrawerOpen(false);
                setScheduleModalOpen(true);
              }}
            />
          </div>
        </div>
      )}

      <ScheduleSessionModal
        isOpen={scheduleModalOpen}
        onClose={() => setScheduleModalOpen(false)}
        selectedChat={selectedChat}
      />
    </div>
  );
}

export default ChatPage;
