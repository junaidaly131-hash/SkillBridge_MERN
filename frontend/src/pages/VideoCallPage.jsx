import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import VideoCallRoom from "../components/VideoCall/VideoCallRoom";
import { fetchMeetingById, clearCurrentMeeting } from "../store/meetingsSlice";

function VideoCallPage() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);
  const { currentMeeting, currentMeetingLoading, currentMeetingError } = useSelector(
    (state) => state.meetings
  );

  useEffect(() => {
    dispatch(fetchMeetingById(id));
    return () => {
      dispatch(clearCurrentMeeting());
    };
  }, [dispatch, id]);

  const handleLeave = () => {
    navigate("/chat");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-dark-blue shrink-0">
        <button
          onClick={handleLeave}
          className="flex items-center gap-2 text-white font-family-poppins text-sm font-medium hover:opacity-80 transition-all"
        >
          <ArrowLeft size={18} />
          Leave Call
        </button>
        <p className="font-family-poppins text-sm text-white/80 truncate max-w-[60%]">
          {currentMeeting?.title || ""}
        </p>
      </div>

      <div className="flex-1 min-h-0">
        {currentMeetingLoading && (
          <div className="w-full h-full flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-white" />
          </div>
        )}

        {!currentMeetingLoading && currentMeetingError && (
          <div className="w-full h-full flex flex-col items-center justify-center gap-4 px-4">
            <p className="font-family-poppins text-white text-center">{currentMeetingError}</p>
            <button
              onClick={handleLeave}
              className="font-family-poppins text-sm font-semibold text-white bg-teal-button px-4 py-2 rounded-lg"
            >
              Back to Chat
            </button>
          </div>
        )}

        {!currentMeetingLoading && !currentMeetingError && currentMeeting && (
          <VideoCallRoom
            roomName={currentMeeting.videoRoomName}
            jwt={currentMeeting.jaasToken}
            displayName={user?.name || "Guest"}
            email={user?.email}
            onCallEnded={handleLeave}
          />
        )}
      </div>
    </div>
  );
}

export default VideoCallPage;
