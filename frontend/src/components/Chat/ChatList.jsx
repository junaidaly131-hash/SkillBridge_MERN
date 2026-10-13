import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Menu, Archive, ArchiveRestore, ArrowLeft, ChevronDown, Trash2 } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { fetchConversations, setConversationArchived, deleteConversation } from "../../store/chatSlice";
import { useToast } from "../../ui/Toast";
import ChatListSkeleton from "./ChatListSkeleton";

function ChatList({ selectedChat, onSelectChat, onToggleMobile }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  // Conversation awaiting a delete confirmation, if any.
  const [pendingDelete, setPendingDelete] = useState(null);
  const toast = useToast();
  const dispatch = useDispatch();
  const { conversations, loading, typingByConversation } = useSelector((state) => state.chat);
  const { user } = useSelector((state) => state.auth);
  const { onlineUserIds } = useSelector((state) => state.presence);

  useEffect(() => {
    dispatch(fetchConversations());
  }, [dispatch]);

  const displayConversations = useMemo(() => {
    const meId = user?.id;
    return (conversations || []).map((c) => {
      const other = (c.participants || []).find((p) => String(p._id || p.id) !== String(meId));
      const lastText = c.lastMessage?.messageType === "attachment"
        ? `📎 ${c.lastMessage?.metadata?.fileName || "Attachment"}`
        : c.lastMessage?.text || "";
      const ts = c.lastMessage?.createdAt || c.updatedAt;
      const time = ts ? new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
      return {
        _id: c._id,
        name: other?.name || "Conversation",
        avatar: other?.avatar || null,
        lastMessage: lastText,
        time,
        unread: c.unreadCount || 0,
        otherUserId: other?._id || other?.id,
        archived: Boolean(c.archived),
        // Typing arrives for every conversation, not just the open one, which
        // is what lets this row say so while the user is looking elsewhere.
        isTyping: Boolean(typingByConversation[c._id]),
      };
    });
  }, [conversations, user, typingByConversation]);

  const matchesSearch = (conv) =>
    (conv.name || "").toLowerCase().includes(searchQuery.toLowerCase());

  const inboxConversations = displayConversations.filter((c) => !c.archived && matchesSearch(c));
  const archivedConversations = displayConversations.filter((c) => c.archived && matchesSearch(c));
  // Archived rows keep their unread count, because archiving is about where a
  // chat is listed and never about silencing it.
  const archivedUnread = archivedConversations.reduce((n, c) => n + c.unread, 0);

  const handleArchive = async (conv) => {
    try {
      await dispatch(
        setConversationArchived({ conversationId: conv._id, archived: !conv.archived })
      ).unwrap();
      toast.success(conv.archived ? "Moved back to your inbox." : "Chat archived.");
      dispatch(fetchConversations());
    } catch (err) {
      toast.error(err || "Couldn't update this chat");
    }
  };

  const handleConfirmDelete = async () => {
    const conv = pendingDelete;
    setPendingDelete(null);
    if (!conv) return;
    try {
      await dispatch(deleteConversation(conv._id)).unwrap();
      // Deleting the chat that is currently open leaves the thread pane showing
      // a conversation the user no longer has.
      if (selectedChat?._id === conv._id) onSelectChat(null);
    } catch (err) {
      toast.error(err || "Couldn't delete this chat");
    }
  };

  const rowProps = {
    onSelect: onSelectChat,
    onArchive: handleArchive,
    onDelete: setPendingDelete,
  };

  // Shown over whichever list is on screen.
  const deleteConfirm = pendingDelete && (
    <div className="fixed inset-0 z-70 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => setPendingDelete(null)} />
      <div className="relative bg-white rounded-xl p-6 max-w-sm w-full shadow-xl">
        <h3 className="font-family-poppins text-lg font-semibold text-black mb-2">Delete chat</h3>
        <p className="font-family-poppins text-sm text-gray mb-4">
          This clears the chat for you only — {pendingDelete.name} keeps their copy. If they
          message you again, the chat comes back with the new messages.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setPendingDelete(null)}
            className="px-4 py-2 text-sm font-family-poppins text-gray hover:bg-gray-100 rounded-lg transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirmDelete}
            className="px-4 py-2 text-sm font-family-poppins text-white bg-red-600 hover:bg-red-700 rounded-lg transition-all"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );

  // Archived is its own screen, not a section that unfolds inside the inbox.
  // Expanding it in place pushed the inbox around and left two lists of chats
  // competing for the same column; replacing the panel keeps one list on screen
  // at a time, which is what the back arrow is for.
  if (showArchived) {
    return (
      <div className="w-full md:w-80 bg-white border-r border-[#E5E5E5] flex flex-col h-full">
        <div className="p-4 border-b border-[#E5E5E5] flex items-center gap-3">
          <button
            onClick={() => setShowArchived(false)}
            className="p-2 -ml-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Back to chats"
          >
            <ArrowLeft size={20} />
          </button>
          <h2 className="font-family-poppins text-base font-semibold text-black">Archived</h2>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {archivedConversations.length === 0 ? (
            <p className="font-family-poppins text-xs text-gray text-center py-8 px-4">
              No archived chats.
            </p>
          ) : (
            archivedConversations.map((conv) => (
              <ConversationRow
                key={conv._id}
                conv={conv}
                isSelected={selectedChat?._id === conv._id}
                isOnline={onlineUserIds.includes(String(conv.otherUserId))}
                {...rowProps}
              />
            ))
          )}
        </div>
        {deleteConfirm}
      </div>
    );
  }

  return (
    <div className="w-full md:w-80 bg-white border-r border-[#E5E5E5] flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-[#E5E5E5]">
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleMobile}
            className="md:hidden p-2 hover:bg-gray-100 rounded-lg"
          >
            <Menu size={20} />
          </button>
          <div className="flex-1 relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray"
              size={18}
            />
            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-light-gray rounded-lg font-family-poppins text-sm outline-none"
            />
          </div>
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {loading ? (
          <ChatListSkeleton />
        ) : (
          <>
            {inboxConversations.length === 0 && archivedConversations.length === 0 && (
              <p className="font-family-poppins text-xs text-gray text-center py-8 px-4">
                {searchQuery ? "No chats match that search." : "No conversations yet."}
              </p>
            )}

            {/* Pinned above the chats, the way WhatsApp does it - a way in,
                not a section that grows the list it sits under. */}
            {archivedConversations.length > 0 && (
              <button
                type="button"
                onClick={() => setShowArchived(true)}
                className="w-full flex items-center gap-3 px-4 py-3 border-b border-[#E5E5E5] text-left hover:bg-gray-50 transition-colors"
              >
                <Archive className="text-gray shrink-0" size={18} />
                <span className="font-family-poppins text-sm text-black flex-1">Archived</span>
                {archivedUnread > 0 ? (
                  <span className="min-w-5 h-5 px-1.5 bg-teal-button text-white text-xs rounded-full flex items-center justify-center shrink-0">
                    {archivedUnread}
                  </span>
                ) : (
                  <span className="font-family-poppins text-xs text-gray shrink-0">
                    {archivedConversations.length}
                  </span>
                )}
              </button>
            )}

            {inboxConversations.map((conv) => (
              <ConversationRow
                key={conv._id}
                conv={conv}
                isSelected={selectedChat?._id === conv._id}
                isOnline={onlineUserIds.includes(String(conv.otherUserId))}
                {...rowProps}
              />
            ))}
          </>
        )}
      </div>
      {deleteConfirm}
    </div>
  );
}

function ConversationRow({ conv, isSelected, isOnline, onSelect, onArchive, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  // Every handler here stops propagation: the whole row is the button that
  // opens the chat, so without it archiving would also switch to that chat.
  const act = (fn) => (e) => {
    e.stopPropagation();
    setMenuOpen(false);
    fn();
  };

  return (
    <div
      onClick={() => onSelect(conv)}
      className={`group relative flex items-center gap-3 p-4 cursor-pointer transition-all ${
        isSelected ? "bg-light-teal" : "hover:bg-gray-50"
      }`}
    >
      {/* Avatar */}
      <div className="relative w-12 h-12 shrink-0">
        <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden">
          {conv.avatar ? (
            <img src={conv.avatar} alt={conv.name} className="w-full h-full rounded-full object-cover" />
          ) : (
            <span className="text-gray text-lg font-medium">{conv.name?.charAt(0) || "U"}</span>
          )}
        </div>
        {isOnline && (
          <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-family-poppins text-sm font-semibold text-black truncate">{conv.name}</h3>
          <span className="font-family-poppins text-xs text-gray shrink-0">{conv.time}</span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-1">
          {/* Typing replaces the preview rather than sitting beside it - the
              row is narrow, and what they are about to say matters more than
              what was said last. */}
          {conv.isTyping ? (
            <p className="font-family-poppins text-xs text-teal truncate pr-2 flex items-center gap-1.5">
              <span className="flex items-center gap-0.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1 h-1 rounded-full bg-teal typing-dot"
                    style={{ animationDelay: `${i * 160}ms` }}
                  />
                ))}
              </span>
              typing
            </p>
          ) : (
            <p className="font-family-poppins text-xs text-gray truncate pr-2">{conv.lastMessage}</p>
          )}
          {conv.unread > 0 && (
            <span className="min-w-5 h-5 px-1.5 bg-teal-button text-white text-xs rounded-full flex items-center justify-center shrink-0">
              {conv.unread}
            </span>
          )}
        </div>
      </div>

      {/* Row actions. On a phone there is no hover to reveal them, so they stay
          visible there; on a pointer device they appear with the row. */}
      <div className="relative shrink-0" ref={menuRef}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          aria-label={`Options for ${conv.name}`}
          className={`p-1 rounded-full text-gray hover:text-black hover:bg-gray-200 transition-all ${
            menuOpen ? "opacity-100" : "opacity-100 md:opacity-0 md:group-hover:opacity-100"
          }`}
        >
          <ChevronDown size={16} />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 z-30 min-w-40 bg-white border border-[#E5E5E5] rounded-lg shadow-lg py-1">
            <button
              type="button"
              onClick={act(() => onArchive(conv))}
              className="w-full px-3 py-2 text-left text-sm text-black hover:bg-gray-50 flex items-center gap-2 font-family-poppins"
            >
              {conv.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
              {conv.archived ? "Move to inbox" : "Archive chat"}
            </button>
            <button
              type="button"
              onClick={act(() => onDelete(conv))}
              className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 font-family-poppins"
            >
              <Trash2 size={15} />
              Delete chat
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatList;
