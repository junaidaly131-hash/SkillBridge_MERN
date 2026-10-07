import { Link } from "react-router-dom";
import { BadgeCheck, MapPin, Star } from "lucide-react";

// Shared by the directory and every skill page. Kept in one place so the two
// can't drift into looking like different products.
function TeacherCard({ teacher }) {
  return (
    <Link
      to={`/teachers/${teacher.id}`}
      className="bg-white rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="flex items-start gap-3 mb-3">
        {teacher.avatar ? (
          <img src={teacher.avatar} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-light-teal flex items-center justify-center shrink-0 font-family-poppins font-semibold text-teal">
            {teacher.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="font-family-poppins font-semibold text-black truncate flex items-center gap-1">
            {teacher.name}
            <BadgeCheck className="text-teal shrink-0" size={15} />
          </p>
          {teacher.location && (
            <p className="font-family-poppins text-xs text-gray flex items-center gap-1 truncate">
              <MapPin size={11} /> {teacher.location}
            </p>
          )}
        </div>
      </div>

      {teacher.bio && (
        <p className="font-family-poppins text-sm text-gray line-clamp-2 mb-3">{teacher.bio}</p>
      )}

      <div className="flex flex-wrap gap-1.5 mb-3">
        {teacher.skills.slice(0, 3).map((s) => (
          <span
            key={s.name}
            className="font-family-poppins text-xs bg-light-teal text-teal px-2 py-1 rounded-md"
          >
            {s.name}
          </span>
        ))}
        {teacher.skills.length > 3 && (
          <span className="font-family-poppins text-xs text-gray px-1 py-1">
            +{teacher.skills.length - 3}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 font-family-poppins text-xs text-gray">
        <span className="flex items-center gap-1">
          <Star className="text-yellow-500 fill-yellow-500" size={13} />
          {teacher.stats.avgRating > 0 ? teacher.stats.avgRating.toFixed(1) : "New"}
        </span>
        <span>
          {teacher.stats.sessionsTaught} session{teacher.stats.sessionsTaught === 1 ? "" : "s"} taught
        </span>
      </div>
    </Link>
  );
}

export default TeacherCard;
