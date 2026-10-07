import { useState, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { X, Camera, Loader2, Search, Check } from "lucide-react";
import Button from "../../ui/Button";
import { useToast } from "../../ui/Toast";
import { availableLanguages, timezones, certificationSuggestions } from "../../utils/profileOptions";
import { skillSuggestions } from "../../utils/skillSuggestions";
import Combobox from "../../ui/Combobox";
import {
  updateProfile,
  uploadAvatar,
  addTeachingSkill,
  removeTeachingSkill,
  addLearningSkill,
  removeLearningSkill,
  addCertification,
  removeCertification,
} from "../../store/profileSlice";

// Skill suggestions list

// Certification suggestions list

function EditProfileModal({ isOpen, onClose, user }) {
  const dispatch = useDispatch();
  const { showSuccess, showError } = useToast();
  const { updateLoading } = useSelector((state) => state.profile);
  const fileInputRef = useRef(null);
  const isInitializedRef = useRef(false);

  const [isClosing, setIsClosing] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    bio: "",
    location: "",
    timezone: "",
    languages: [],
    acceptsFreeTrialSessions: false,
  });

  // Skills and certifications state
  const [skillsTeaching, setSkillsTeaching] = useState([]);
  const [skillsLearning, setSkillsLearning] = useState([]);
  const [certifications, setCertifications] = useState([]);
  const [teachingSearch, setTeachingSearch] = useState("");
  const [learningSearch, setLearningSearch] = useState("");
  const [certificationSearch, setCertificationSearch] = useState("");

  // Initialize form only when modal opens, not when user changes
  useEffect(() => {
    if (isOpen && !isInitializedRef.current) {
      setFormData({
        name: user?.name || "",
        bio: user?.bio || "",
        location: user?.location || "",
        timezone: user?.timezone || "",
        languages: user?.languages || [],
        acceptsFreeTrialSessions: Boolean(user?.acceptsFreeTrialSessions),
      });
      setAvatarPreview(user?.avatar || null);
      setAvatarFile(null);
      setSkillsTeaching(user?.skillsTeaching || []);
      setSkillsLearning(user?.skillsLearning || []);
      setCertifications(user?.certifications || []);
      setTeachingSearch("");
      setLearningSearch("");
      setCertificationSearch("");
      isInitializedRef.current = true;
    }
    
    // Reset initialization flag when modal closes
    if (!isOpen) {
      isInitializedRef.current = false;
    }
  }, [isOpen, user]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  };

  const handleLanguageToggle = (lang) => {
    setFormData((prev) => ({
      ...prev,
      languages: prev.languages.includes(lang)
        ? prev.languages.filter((l) => l !== lang)
        : [...prev.languages, lang],
    }));
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onload = () => {
        setAvatarPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // Skills handlers
  const handleAddTeachingSkill = async (name) => {
    const skillName = (name ?? teachingSearch).trim();
    if (skillName) {
      const exists = skillsTeaching.some(
        (s) => s.name?.toLowerCase() === skillName.toLowerCase()
      );
      if (!exists) {
        try {
          const updatedSkills = await dispatch(addTeachingSkill(skillName)).unwrap();
          setSkillsTeaching(updatedSkills);
          showSuccess("Teaching skill added successfully!");
        } catch (error) {
          console.error("Failed to add teaching skill:", error);
          showError(error.message || "Failed to add teaching skill");
        }
      }
      setTeachingSearch("");
    }
  };

  const handleRemoveTeachingSkill = async (skillId) => {
    try {
      const updatedSkills = await dispatch(removeTeachingSkill(skillId)).unwrap();
      setSkillsTeaching(updatedSkills);
      showSuccess("Teaching skill removed successfully!");
    } catch (error) {
      // The thunk rejects with a plain string (e.g. the "cash out first"
      // guard), so error.message would be undefined and swallow it.
      showError(error || "Failed to remove teaching skill");
    }
  };

  const handleAddLearningSkill = async (name) => {
    const skillName = (name ?? learningSearch).trim();
    if (skillName) {
      if (
        !skillsLearning.some(
          (s) => s.name?.toLowerCase() === skillName.toLowerCase()
        )
      ) {
        try {
          const updatedSkills = await dispatch(addLearningSkill(skillName)).unwrap();
          setSkillsLearning(updatedSkills);
          showSuccess("Learning skill added successfully!");
        } catch (error) {
          console.error("Failed to add learning skill:", error);
          showError(error.message || "Failed to add learning skill");
        }
      }
      setLearningSearch("");
    }
  };

  const handleRemoveLearningSkill = async (skillId) => {
    try {
      const updatedSkills = await dispatch(removeLearningSkill(skillId)).unwrap();
      setSkillsLearning(updatedSkills);
      showSuccess("Learning skill removed successfully!");
    } catch (error) {
      console.error("Failed to remove learning skill:", error);
      showError(error.message || "Failed to remove learning skill");
    }
  };

  const handleAddCertification = async (name) => {
    const certName = (name ?? certificationSearch).trim();
    if (certName) {
      const exists = certifications.some(
        (c) => c.name?.toLowerCase() === certName.toLowerCase()
      );
      if (!exists) {
        try {
          const updatedCerts = await dispatch(addCertification({ name: certName })).unwrap();
          setCertifications(updatedCerts);
          showSuccess("Certification added successfully!");
        } catch (error) {
          console.error("Failed to add certification:", error);
          showError(error.message || "Failed to add certification");
        }
      }
      setCertificationSearch("");
    }
  };

  const handleRemoveCertification = async (certId) => {
    try {
      const updatedCerts = await dispatch(removeCertification(certId)).unwrap();
      setCertifications(updatedCerts);
      showSuccess("Certification removed successfully!");
    } catch (error) {
      console.error("Failed to remove certification:", error);
      showError(error.message || "Failed to remove certification");
    }
  };


  const handleSave = async () => {
    try {
      // Upload avatar if changed
      if (avatarFile) {
        await dispatch(uploadAvatar(avatarFile)).unwrap();
        showSuccess("Avatar updated successfully!");
      }

      // Update profile data
      await dispatch(updateProfile(formData)).unwrap();
      showSuccess("Profile updated successfully!");
      handleClose();
    } catch (error) {
      console.error("Failed to update profile:", error);
      showError(error.message || "Failed to update profile");
    }
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
        className={`relative bg-white shadow-xl rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-y-auto scrollbar-hide ${
          isClosing ? "modal-content-exit" : "modal-content-enter"
        }`}
      >
        {/* Header */}
        <div className="sticky top-0 z-50 bg-white p-6 pb-4 border-b border-[#E5E5E5] flex items-start gap-4">
          {/* Avatar */}
          <div className="relative w-16 h-16 shrink-0">
            <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden">
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt={formData.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-gray text-2xl font-medium">
                  {formData.name?.charAt(0)?.toUpperCase()}
                </span>
              )}
            </div>
            <button
              onClick={handleAvatarClick}
              className="absolute bottom-0 right-0 w-6 h-6 bg-teal rounded-full flex items-center justify-center hover:bg-teal/90 transition-colors"
            >
              <Camera className="text-white" size={12} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="hidden"
            />
          </div>

          <div className="flex-1">
            <h2 className="font-family-poppins text-xl font-bold text-black">
              {formData.name || "Your Name"}
            </h2>
            <textarea
              value={formData.bio}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, bio: e.target.value }))
              }
              placeholder="Write a short bio about yourself..."
              maxLength={500}
              className="w-full mt-2 p-2 text-sm text-gray border border-[#E5E5E5] rounded-lg resize-none font-family-poppins outline-none focus:border-teal"
              rows={3}
            />
            <p className="text-xs text-gray mt-1">
              {formData.bio.length}/500 characters
            </p>
          </div>

          <button
            onClick={handleClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-all"
          >
            <X className="text-gray" size={24} />
          </button>
        </div>

        {/* Form Content */}
        <div className="py-6 px-10 max-w-5xl mx-auto space-y-6">
          {/* Name and Language */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="max-w-md">
              <label className="font-family-poppins text-sm font-medium text-gray block mb-2">
                Full Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                className="w-full px-4 py-3 border border-[#D0D0D0] rounded-lg font-family-poppins text-sm outline-none focus:border-teal"
              />
            </div>

            <div>
              <label className="font-family-poppins text-sm font-medium text-gray block mb-3">
                Languages
              </label>
              <div className="flex flex-wrap gap-2">
                {availableLanguages.map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => handleLanguageToggle(lang)}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-full font-family-poppins text-sm transition-all ${
                      formData.languages.includes(lang)
                        ? "bg-teal-button text-white"
                        : "bg-gray-100 text-gray hover:bg-gray-200"
                    }`}
                  >
                    {formData.languages.includes(lang) && (
                      <Check size={14} />
                    )}
                    {lang}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Location */}
          <div className="max-w-md">
            <label className="font-family-poppins text-sm font-medium text-gray block mb-2">
              Location
            </label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, location: e.target.value }))
              }
              placeholder="e.g., San Francisco, CA"
              className="w-full px-4 py-3 border border-[#D0D0D0] rounded-lg font-family-poppins text-sm outline-none focus:border-teal"
            />
          </div>

          {/* Timezone */}
          <div className="max-w-md">
            <label className="font-family-poppins text-sm font-medium text-gray block mb-2">
              Timezone
            </label>
            <select
              value={formData.timezone}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, timezone: e.target.value }))
              }
              className="w-full px-4 py-3 border border-[#D0D0D0] rounded-lg font-family-poppins text-sm outline-none focus:border-teal bg-white"
            >
              <option value="">Select timezone</option>
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>

          {/* Skills I Teach */}
          <div>
            <label className="font-family-poppins text-sm font-bold text-black block mb-3">
              Skills I Teach
            </label>
            <div className="mb-3 max-w-md">
              <Combobox
                value={teachingSearch}
                onChange={setTeachingSearch}
                options={skillSuggestions}
                exclude={skillsTeaching.map((x) => x.name || x)}
                placeholder="Search..."
                aria-label="Skills I Teach"
                leadingIcon={<Search size={16} />}
                inputClassName="py-2.5"
                listClassName="z-60"
                onSelect={(v) => handleAddTeachingSkill(v)}
                onSubmit={() => handleAddTeachingSkill()}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {skillsTeaching.map((skill) => (
                <span
                  key={skill._id || skill.name}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-teal-button text-white rounded-full font-family-poppins text-sm"
                >
                  {skill.name}
                  <button
                    onClick={() => handleRemoveTeachingSkill(skill._id)}
                    className="hover:bg-white/20 rounded-full p-0.5 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
              {skillsTeaching.length === 0 && (
                <p className="font-family-poppins text-sm text-gray">
                  No teaching skills added yet. Search and select or press Enter to add.
                </p>
              )}
            </div>

            <label className="flex items-start gap-2.5 mt-3 p-3 bg-gray-50 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={formData.acceptsFreeTrialSessions}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, acceptsFreeTrialSessions: e.target.checked }))
                }
                className="mt-0.5 accent-teal"
              />
              <span className="font-family-poppins text-xs text-black">
                <span className="font-semibold">Accept free trial sessions from new students</span> -
                new students get one free session with a teacher who opts in. You won't earn credits
                for that specific session. Off by default.
              </span>
            </label>
          </div>

          {/* Skills I'm Learning */}
          <div>
            <label className="font-family-poppins text-sm font-bold text-black block mb-3">
              Skills I'm Learning
            </label>
            <div className="mb-3 max-w-md">
              <Combobox
                value={learningSearch}
                onChange={setLearningSearch}
                options={skillSuggestions}
                exclude={skillsLearning.map((x) => x.name || x)}
                placeholder="Search..."
                aria-label="Skills I Want to Learn"
                leadingIcon={<Search size={16} />}
                inputClassName="py-2.5"
                listClassName="z-60"
                onSelect={(v) => handleAddLearningSkill(v)}
                onSubmit={() => handleAddLearningSkill()}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {skillsLearning.map((skill) => (
                <span
                  key={skill._id || skill.name}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-teal-button text-white rounded-full font-family-poppins text-sm"
                >
                  {skill.name}
                  <button
                    onClick={() => handleRemoveLearningSkill(skill._id)}
                    className="hover:bg-white/20 rounded-full p-0.5 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
              {skillsLearning.length === 0 && (
                <p className="font-family-poppins text-sm text-gray">
                  No learning goals added yet. Search and select or press Enter to add.
                </p>
              )}
            </div>
          </div>

          {/* Certifications */}
          <div>
            <label className="font-family-poppins text-sm font-bold text-black block mb-3">
              Certifications
            </label>
            <div className="mb-3 max-w-md">
              <Combobox
                value={certificationSearch}
                onChange={setCertificationSearch}
                options={certificationSuggestions}
                exclude={certifications.map((x) => x.name || x)}
                placeholder="Search..."
                aria-label="Certifications"
                leadingIcon={<Search size={16} />}
                inputClassName="py-2.5"
                listClassName="z-60"
                onSelect={(v) => handleAddCertification(v)}
                onSubmit={() => handleAddCertification()}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {certifications.map((cert) => (
                <span
                  key={cert._id || cert.name}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-teal-button text-white rounded-full font-family-poppins text-sm"
                >
                  {cert.name}
                  <button
                    onClick={() => handleRemoveCertification(cert._id)}
                    className="hover:bg-white/20 rounded-full p-0.5 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
              {certifications.length === 0 && (
                <p className="font-family-poppins text-sm text-gray">
                  No certifications added yet. Search and select or press Enter to add.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 z-50 bg-white p-6 pt-4 border-t border-[#E5E5E5] flex justify-end gap-3">
          <Button
            variant="outline"
            className="px-6 py-2.5"
            onClick={handleClose}
            disabled={updateLoading}
          >
            Cancel
          </Button>
          <Button
            variant="herobtn"
            className="px-6 py-2.5 bg-dark-blue flex items-center gap-2"
            onClick={handleSave}
            disabled={updateLoading}
          >
            {updateLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {updateLoading ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default EditProfileModal;
