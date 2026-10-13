import { useEffect, useMemo, useState } from "react";
import { Search, Menu, Archive, ChevronDown } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { fetchConversations } from "../../store/chatSlice";
import ChatListSkeleton from "./ChatListSkeleton";

function ChatList({ selectedChat, onSelectChat, onToggleMobile }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
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

            {inboxConversations.map((conv) => (
              <ConversationRow
                key={conv._id}
                conv={conv}
                isSelected={selectedChat?._id === conv._id}
                isOnline={onlineUserIds.includes(String(conv.otherUserId))}
                onSelect={onSelectChat}
              />
            ))}

            {archivedConversations.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setShowArchived((v) => !v)}
                  className="w-full flex items-center gap-2 px-4 py-3 border-t border-[#E5E5E5] text-left hover:bg-gray-50 transition-colors"
                >
                  <Archive className="text-gray shrink-0" size={16} />
                  <span className="font-family-poppins text-xs font-medium text-gray flex-1">
                    Archived ({archivedConversations.length})
                  </span>
                  {archivedUnread > 0 && (
                    <span className="min-w-5 h-5 px-1.5 bg-teal-button text-white text-xs rounded-full flex items-center justify-center shrink-0">
                      {archivedUnread}
                    </span>
                  )}
                  <ChevronDown
                    className={`text-gray shrink-0 transition-transform ${showArchived ? "rotate-180" : ""}`}
                    size={16}
                  />
                </button>

                {showArchived &&
                  archivedConversations.map((conv) => (
                    <ConversationRow
                      key={conv._id}
                      conv={conv}
                      isSelected={selectedChat?._id === conv._id}
                      isOnline={onlineUserIds.includes(String(conv.otherUserId))}
                      onSelect={onSelectChat}
                    />
                  ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ConversationRow({ conv, isSelected, isOnline, onSelect }) {
  return (
    <div
      onClick={() => onSelect(conv)}
      className={`flex items-center gap-3 p-4 cursor-pointer transition-all ${
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
    </div>
  );
}

export default ChatList;
