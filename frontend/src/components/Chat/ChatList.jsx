import { useEffect, useMemo, useState } from "react";
import { Search, Menu } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { fetchConversations } from "../../store/chatSlice";
import ChatListSkeleton from "./ChatListSkeleton";

function ChatList({ selectedChat, onSelectChat, onToggleMobile }) {
  const [searchQuery, setSearchQuery] = useState("");
  const dispatch = useDispatch();
  const { conversations, loading } = useSelector((state) => state.chat);
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
      };
    });
  }, [conversations, user]);

  const filteredConversations = displayConversations.filter((conv) =>
    (conv.name || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

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
          filteredConversations.map((conv) => (
            <div
              key={conv._id}
              onClick={() => onSelectChat(conv)}
              className={`flex items-center gap-3 p-4 cursor-pointer transition-all ${
                selectedChat?._id === conv._id
                  ? "bg-light-teal"
                  : "hover:bg-gray-50"
              }`}
            >
              {/* Avatar */}
              <div className="relative w-12 h-12 shrink-0">
                <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden">
                  {conv.avatar ? (
                    <img
                      src={conv.avatar}
                      alt={conv.name}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-gray text-lg font-medium">
                      {conv.name?.charAt(0) || 'U'}
                    </span>
                  )}
                </div>
                {onlineUserIds.includes(String(conv.otherUserId)) && (
                  <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="font-family-poppins text-sm font-semibold text-black truncate">
                    {conv.name}
                  </h3>
                  <span className="font-family-poppins text-xs text-gray">
                    {conv.time}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <p className="font-family-poppins text-xs text-gray truncate pr-2">
                    {conv.lastMessage}
                  </p>
                  {conv.unread > 0 && (
                    <span className="w-5 h-5 bg-teal-button text-white text-xs rounded-full flex items-center justify-center shrink-0">
                      {conv.unread}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default ChatList;
