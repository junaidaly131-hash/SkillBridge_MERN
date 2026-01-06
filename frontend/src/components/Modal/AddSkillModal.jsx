import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { X, Loader2 } from "lucide-react";
import Button from "../../ui/Button";
import { addTeachingSkill, addLearningSkill } from "../../store/profileSlice";
import { useToast } from "../../ui/Toast/ToastContext";

const skillSuggestions = [
  "React Development",
  "JavaScript",
  "TypeScript",
  "Node.js",
  "Python",
  "Machine Learning",
  "Data Science",
  "UI/UX Design",
  "Graphic Design",
  "Digital Marketing",
  "Social Media Marketing",
  "Content Writing",
  "SEO",
  "AWS",
  "DevOps",
  "Docker",
  "Kubernetes",
  "MongoDB",
  "PostgreSQL",
  "Java",
  "C++",
  "Go",
  "Rust",
  "Swift",
  "iOS Development",
  "Android Development",
  "Flutter",
  "React Native",
  "Vue.js",
  "Angular",
  "PHP",
  "Laravel",
  "Django",
  "FastAPI",
  "GraphQL",
  "REST API",
  "Blockchain",
  "Web3",
  "Solidity",
  "Cybersecurity",
  "Network Security",
  "Cloud Computing",
  "Azure",
  "Google Cloud",
  "Linux",
  "Git",
  "Agile",
  "Scrum",
  "Project Management",
  "Product Management",
];

function AddSkillModal({ isOpen, onClose, type, title }) {
  const dispatch = useDispatch();
  const { updateLoading } = useSelector((state) => state.profile);
  const toast = useToast();

  const [isClosing, setIsClosing] = useState(false);
  const [skillName, setSkillName] = useState("");
  const [filteredSuggestions, setFilteredSuggestions] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      setSkillName("");
      setError("");
      setFilteredSuggestions([]);
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  useEffect(() => {
    if (skillName.trim()) {
      const filtered = skillSuggestions.filter((skill) =>
        skill.toLowerCase().includes(skillName.toLowerCase())
      );
      setFilteredSuggestions(filtered.slice(0, 6));
    } else {
      setFilteredSuggestions([]);
    }
  }, [skillName]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!skillName.trim()) {
      setError("Please enter a skill name");
      return;
    }

    try {
      if (type === "teaching") {
        await dispatch(addTeachingSkill(skillName.trim())).unwrap();
        toast.success(`Teaching skill "${skillName.trim()}" added successfully!`);
      } else {
        await dispatch(addLearningSkill(skillName.trim())).unwrap();
        toast.success(`Learning skill "${skillName.trim()}" added successfully!`);
      }
      handleClose();
    } catch (err) {
      setError(err || "Failed to add skill");
      toast.error(err || "Failed to add skill");
    }
  };

  const handleSuggestionClick = (suggestion) => {
    setSkillName(suggestion);
    setFilteredSuggestions([]);
  };

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${
        isClosing ? "modal-overlay-exit" : "modal-overlay-enter"
      }`}
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* Modal Content */}
      <div
        className={`relative bg-white shadow-xl rounded-2xl w-full max-w-md ${
          isClosing ? "modal-content-exit" : "modal-content-enter"
        }`}
      >
        {/* Header */}
        <div className="p-6 pb-4 border-b border-[#E5E5E5] flex items-center justify-between">
          <h2 className="font-family-poppins text-xl font-bold text-black">
            {title}
          </h2>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-all"
          >
            <X className="text-gray" size={24} />
          </button>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="relative">
            <label className="font-family-poppins text-sm font-medium text-gray block mb-2">
              Skill Name
            </label>
            <input
              type="text"
              value={skillName}
              onChange={(e) => setSkillName(e.target.value)}
              placeholder="e.g., React Development"
              className="w-full px-4 py-3 border border-[#D0D0D0] rounded-lg font-family-poppins text-sm outline-none focus:border-teal"
              autoFocus
            />

            {/* Suggestions Dropdown */}
            {filteredSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#E5E5E5] rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                {filteredSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="w-full px-4 py-2 text-left font-family-poppins text-sm hover:bg-teal/10 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && (
            <p className="text-red-500 text-sm font-family-poppins">{error}</p>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              className="px-6 py-2.5"
              onClick={handleClose}
              disabled={updateLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="herobtn"
              className="px-6 py-2.5 bg-dark-blue flex items-center gap-2"
              disabled={updateLoading}
            >
              {updateLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {updateLoading ? "Adding..." : "Add Skill"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddSkillModal;
