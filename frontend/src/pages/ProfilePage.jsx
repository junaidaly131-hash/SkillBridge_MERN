import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { Mail, MapPin, Globe, Clock, Star, Pencil, Plus, X, Award, Loader2, FileText, ShieldCheck, Upload, Eye } from "lucide-react";
import Button from "../ui/Button";
import { getSocket } from "../socket";
import { VERIFICATION_DOC_TYPES } from "../utils/verificationDocTypes";
import DocumentViewer from "../ui/DocumentViewer";
import Badge from "../ui/Badge";
import EditProfileModal from "../components/Modal/EditProfileModal";
import AddSkillModal from "../components/Modal/AddSkillModal";
import AddCertificationModal from "../components/Modal/AddCertificationModal";
import apiClient from "../api/client";
import { downloadBlob } from "../utils/downloadBlob";
import { useToast } from "../ui/Toast";
import {
  fetchProfile,
  removeTeachingSkill,
  removeLearningSkill,
  removeCertification,
  addCertification,
  submitVerification,
  setVerificationStatus,
} from "../store/profileSlice";

// Mirrors multer's per-file limit in backend/config/cloudinary.js. The total
// count caps itself: one file per document type slot.
const MAX_VERIFICATION_FILE_BYTES = 10 * 1024 * 1024;

function ProfilePage() {
  const dispatch = useDispatch();
  const location = useLocation();
  const { success: showSuccess, error: showError } = useToast();
  const { profile, loading, error } = useSelector((state) => state.profile);

  // Which navigation's #verification hash we've already scrolled for.
  const hashHandledRef = useRef(null);

  const [previewCert, setPreviewCert] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAddTeachingSkillOpen, setIsAddTeachingSkillOpen] = useState(false);
  const [isAddLearningSkillOpen, setIsAddLearningSkillOpen] = useState(false);
  const [isAddCertificationOpen, setIsAddCertificationOpen] = useState(false);
  const [isEditCertificationOpen, setIsEditCertificationOpen] = useState(false);
  const [editingCert, setEditingCert] = useState(null);
  // { [docType]: File }
  const [verificationFiles, setVerificationFiles] = useState({});
  // Non-recommended slots the user chose to add.
  const [extraDocSlots, setExtraDocSlots] = useState([]);
  const [verificationFileError, setVerificationFileError] = useState("");
  const [submittingVerification, setSubmittingVerification] = useState(false);

  useEffect(() => {
    dispatch(fetchProfile());
  }, [dispatch]);

  // Arriving from the dashboard's "Verify now" link. The hash alone doesn't
  // work: the verification card isn't rendered until fetchProfile resolves, so
  // by the time it exists the browser has already given up looking for it and
  // ScrollRestoration has parked us at the top. Scroll once it's really there.
  //
  // Keyed on location.key so it fires once per navigation - otherwise a live
  // verificationReviewed event would yank the page back down mid-read.
  useEffect(() => {
    if (location.hash !== "#verification" || !profile) return;
    if (hashHandledRef.current === location.key) return;

    const el = document.getElementById("verification");
    if (!el) return;

    hashHandledRef.current = location.key;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [location.hash, location.key, profile]);

  // An admin's decision lands here live, so the badge and the status panel
  // update while the user is looking at them.
  useEffect(() => {
    const socket = getSocket();
    const onReviewed = (payload) => dispatch(setVerificationStatus(payload));
    socket.on("verificationReviewed", onReviewed);
    return () => socket.off("verificationReviewed", onReviewed);
  }, [dispatch]);

  const handleRemoveTeachingSkill = async (skillId) => {
    try {
      await dispatch(removeTeachingSkill(skillId)).unwrap();
    } catch (err) {
      // Surfaces the server's reason - notably the guard that stops someone
      // dropping their last teaching skill while earned credits are unpaid.
      showError(err || "Failed to remove teaching skill");
    }
  };

  const handleRemoveLearningSkill = (skillId) => {
    dispatch(removeLearningSkill(skillId));
  };

  const handleRemoveCertification = (certId) => {
    dispatch(removeCertification(certId));
  };

  // One slot per document type, so a teacher is told what to provide instead
  // of dropping an unlabelled pile of files on the reviewer. State is keyed by
  // docType; picking again in the same slot replaces that file.
  const handleVerificationFilePicked = (docType, e) => {
    const file = e.target.files?.[0];
    // Lets the same file be re-picked after being cleared.
    e.target.value = "";
    if (!file) return;

    if (file.size > MAX_VERIFICATION_FILE_BYTES) {
      setVerificationFileError(`"${file.name}" is over 10MB - please upload a smaller file.`);
      return;
    }

    setVerificationFileError("");
    setVerificationFiles((prev) => ({ ...prev, [docType]: file }));
  };

  const selectedVerificationCount = Object.keys(verificationFiles).length;

  const isAdmin = profile?.role === "admin";
  const teachesSkills = (profile?.skillsTeaching?.length || 0) > 0;

  // A student only has to prove who they are, so only the ID slot is offered up
  // front - asking a learner for a degree is noise. A teacher is additionally
  // backing a claim students pay against, so the credential slot comes too.
  // This mirrors describeMissingDocs in backend/config/verificationPolicy.js,
  // which is what actually enforces it.
  const docSlots = VERIFICATION_DOC_TYPES.map((t) => ({
    ...t,
    recommended: teachesSkills ? t.recommended : t.value === "cnic",
  }));

  // Recommended slots are always offered; the rest appear once added, or if
  // they somehow already hold a file.
  const visibleDocSlots = docSlots.filter(
    (t) => t.recommended || extraDocSlots.includes(t.value) || verificationFiles[t.value]
  );
  const remainingDocTypes = docSlots.filter(
    (t) => !visibleDocSlots.some((v) => v.value === t.value)
  );

  // Same rule the server applies in describeMissingDocs - checked here only so
  // the button says what's missing instead of the submission bouncing back.
  const CREDENTIAL_TYPES = ["degree", "transcript", "teaching_certificate", "experience_letter", "portfolio"];
  const submissionBlocker = !verificationFiles.cnic
    ? "Attach your CNIC to submit"
    : teachesSkills && !CREDENTIAL_TYPES.some((t) => verificationFiles[t])
      ? "Add one credential as well - degree, transcript, certificate, experience letter or portfolio"
      : null;

  const addDocSlot = (docType) => {
    setVerificationFileError("");
    setExtraDocSlots((prev) => (prev.includes(docType) ? prev : [...prev, docType]));
  };

  // Clearing a recommended slot leaves the row in place; clearing an optional
  // one removes the row too, since it was only there because it was added.
  const removeDocSlot = (docType, recommended) => {
    removeVerificationFile(docType);
    if (!recommended) setExtraDocSlots((prev) => prev.filter((t) => t !== docType));
  };

  const removeVerificationFile = (docType) => {
    setVerificationFileError("");
    setVerificationFiles((prev) => {
      const next = { ...prev };
      delete next[docType];
      return next;
    });
  };

  const handleSubmitVerification = async () => {
    const entries = Object.entries(verificationFiles).map(([docType, file]) => ({ file, docType }));
    if (entries.length === 0 || submissionBlocker) return;
    setSubmittingVerification(true);
    try {
      await dispatch(submitVerification(entries)).unwrap();
      showSuccess("Verification documents submitted. An admin will review them soon.");
      setVerificationFiles({});
      setExtraDocSlots([]);
      setVerificationFileError("");
    } catch (err) {
      showError(err || "Failed to submit verification documents.");
    } finally {
      setSubmittingVerification(false);
    }
  };

  const handleOpenEditCertification = (cert) => {
    setEditingCert(cert);
    setIsEditCertificationOpen(true);
  };

  const handleSubmitEditCertification = async (data) => {
    try {
      await dispatch(addCertification(data)).unwrap();
      await dispatch(removeCertification(editingCert._id)).unwrap();
      setIsEditCertificationOpen(false);
      setEditingCert(null);
    } catch (e) {
      console.error(e);
      alert("Failed to save changes");
    }
  };

  const handleDownloadCertification = async (cert) => {
    try {
      const res = await apiClient.get(`/users/me/certifications/${cert._id}/download`, {
        responseType: "blob",
      });
      // Prefer backend-provided Content-Disposition filename (most reliable)
      const cd = res.headers?.["content-disposition"] || "";
      const matchStar = cd.match(/filename\*\=UTF-8''([^;]+)/i);
      const match = cd.match(/filename=\"?([^\";]+)\"?/i);
      let filename = matchStar ? decodeURIComponent(matchStar[1]) : match ? match[1] : "";
      if (!filename) filename = cert.fileName || `${cert.name || "certificate"}`;
      // If backend didn't provide extension in fileName, try to infer from mime
      if (!filename.includes(".") && cert.fileMimeType) {
        const map = {
          "application/pdf": "pdf",
          "image/jpeg": "jpg",
          "image/png": "png",
          "image/webp": "webp",
          "image/gif": "gif",
          "application/msword": "doc",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
        };
        const ext = map[cert.fileMimeType];
        if (ext) filename = `${filename}.${ext}`;
      }
      downloadBlob(res.data, filename);
    } catch (e) {
      console.error(e);
      alert("Failed to download certificate");
    }
  };

  // Only spin when there is genuinely nothing to show. Spinning on every
  // refetch tore the whole page down and rebuilt it - which, besides the flash
  // on each visit, killed any in-progress scroll to #verification.
  if (loading && !profile) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-teal" />
      </div>
    );
  }

  // Same reasoning: a background refetch failing shouldn't replace a profile
  // the user is already reading with an error screen.
  if (error && !profile) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <Button onClick={() => dispatch(fetchProfile())}>Try Again</Button>
        </div>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Avatar */}
          <div className="relative shrink-0">
            <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden">
              {profile.avatar ? (
                <img
                  src={profile.avatar}
                  alt={profile.name}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <span className="text-gray text-3xl font-medium">
                  {profile.name?.charAt(0)?.toUpperCase()}
                </span>
              )}
            </div>
          </div>

          {/* User Info */}
          <div className="flex-1">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
              <h1 className="font-family-poppins text-2xl font-bold text-black">
                {profile.name}
              </h1>
              <Button
                variant="outline"
                className="flex items-center gap-2 px-4 py-2"
                onClick={() => setIsEditModalOpen(true)}
              >
                <Pencil size={16} />
                Edit Profile
              </Button>
            </div>

            {profile.bio && (
              <p className="font-family-poppins text-sm text-gray mb-4 max-w-xl">
                {profile.bio}
              </p>
            )}

            {/* Contact Info */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              {profile.email && (
                <span className="flex items-center gap-2">
                  <Mail className="text-gray" size={16} />
                  <span className="font-family-poppins text-gray">{profile.email}</span>
                </span>
              )}
              {profile.location && (
                <span className="flex items-center gap-2">
                  <MapPin className="text-gray" size={16} />
                  <span className="font-family-poppins text-gray">{profile.location}</span>
                </span>
              )}
              {profile.languages?.length > 0 && (
                <span className="flex items-center gap-2">
                  <Globe className="text-gray" size={16} />
                  <span className="font-family-poppins text-gray">
                    {profile.languages.join(", ")}
                  </span>
                </span>
              )}
              {profile.timezone && (
                <span className="flex items-center gap-2">
                  <Clock className="text-gray" size={16} />
                  <span className="font-family-poppins text-gray">{profile.timezone}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Marketplace activity is not applicable to administrator accounts. */}
        {!isAdmin && (
        <div className="flex flex-wrap justify-center gap-8 mt-8 pt-6 border-t border-[#E5E5E5]">
          <div className="text-center">
            <p className="font-family-poppins text-3xl font-bold text-black">
              {profile.stats?.sessionsTaught || 0}
            </p>
            <p className="font-family-poppins text-sm text-gray">Sessions Taught</p>
          </div>
          <div className="text-center">
            <p className="font-family-poppins text-3xl font-bold text-black">
              {profile.stats?.sessionsLearned || 0}
            </p>
            <p className="font-family-poppins text-sm text-gray">Sessions Learned</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <Star className="text-yellow-500 fill-yellow-500" size={24} />
              <p className="font-family-poppins text-3xl font-bold text-black">
                {profile.stats?.avgRating?.toFixed(1) || "0.0"}
              </p>
            </div>
            <p className="font-family-poppins text-sm text-gray">Average Rating</p>
          </div>
        </div>
        )}
      </div>

      {!isAdmin && (
        <>
      {/* Skills Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Skills I Teach */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-family-poppins text-lg font-semibold text-black">
              Skills I Teach
            </h2>
            <button
              onClick={() => setIsAddTeachingSkillOpen(true)}
              className="flex items-center gap-1 text-teal font-family-poppins text-sm font-medium hover:underline"
            >
              <Plus size={16} />
              Add Skills
            </button>
          </div>

          <div className="space-y-3">
            {profile.skillsTeaching?.length > 0 ? (
              profile.skillsTeaching.map((skill) => (
                <div
                  key={skill._id}
                  className="flex items-center justify-between p-5 bg-teal/10 shadow-xl rounded-2xl"
                >
                  <div>
                    <p className="font-family-poppins font-medium text-black">
                      {skill.name}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-family-poppins text-xs text-gray">
                        {skill.sessions} sessions
                      </span>
                      <span className="flex items-center gap-1">
                        <Star className="text-yellow-500 fill-yellow-500" size={12} />
                        <span className="font-family-poppins text-xs text-gray">
                          {skill.rating?.toFixed(1) || "0.0"}
                        </span>
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveTeachingSkill(skill._id)}
                    className="p-1 hover:bg-gray-100 rounded"
                  >
                    <X className="text-gray" size={18} />
                  </button>
                </div>
              ))
            ) : (
              <p className="text-gray text-sm text-center py-4">
                No skills added yet. Click "Add Skills" to get started.
              </p>
            )}
          </div>
        </div>

        {/* Skills I'm Learning */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-family-poppins text-lg font-semibold text-black">
              Skills I'm Learning
            </h2>
            <button
              onClick={() => setIsAddLearningSkillOpen(true)}
              className="flex items-center gap-1 text-teal font-family-poppins text-sm font-medium hover:underline"
            >
              <Plus size={16} />
              Add Goal
            </button>
          </div>

          <div className="space-y-3">
            {profile.skillsLearning?.length > 0 ? (
              profile.skillsLearning.map((skill) => {
                // Handle both string and object formats for backward compatibility
                const skillName = typeof skill === 'string' ? skill : skill.name;
                const skillId = typeof skill === 'string' ? skill : skill._id;
                const skillProgress = typeof skill === 'object' ? (skill.progress || 0) : 0;
                const skillSessions = typeof skill === 'object' ? (skill.sessions || 0) : 0;

                return (
                  <div
                    key={skillId}
                    className="p-5 bg-teal/10 shadow-xl rounded-2xl"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="font-family-poppins font-medium text-black">
                          {skillName}
                        </p>
                        <p className="font-family-poppins text-xs text-gray mt-0.5">
                          {skillSessions} session{skillSessions === 1 ? "" : "s"} completed
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-family-poppins text-sm text-gray">
                          {skillProgress}%
                        </span>
                        <button
                          onClick={() => handleRemoveLearningSkill(skillId)}
                          className="p-1 hover:bg-gray-100 rounded"
                        >
                          <X className="text-gray" size={18} />
                        </button>
                      </div>
                    </div>
                    {/* Progress Bar - auto-derived from completed sessions in this skill, not editable */}
                    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-teal rounded-full transition-all duration-300"
                        style={{ width: `${skillProgress}%` }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-gray text-sm text-center py-4">
                No learning goals added yet. Click "Add Goal" to get started.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Certifications Section */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-family-poppins text-lg font-semibold text-black">
            Certifications
          </h2>
          <button
            onClick={() => setIsAddCertificationOpen(true)}
            className="flex items-center gap-1 text-teal font-family-poppins text-sm font-medium hover:underline"
          >
            <Plus size={16} />
            Add Certification
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {profile.certifications?.length > 0 ? (
            profile.certifications.map((cert) => (
              <div
                key={cert._id}
                className="flex items-center gap-4 p-6 bg-teal/10 shadow-xl rounded-3xl"
              >
                <div className="w-12 h-12 bg-teal/20 rounded-full flex items-center justify-center shrink-0">
                  <Award className="text-teal" size={24} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-family-poppins font-medium text-black truncate">
                    {cert.name}
                  </p>
                  <p className="font-family-poppins text-xs text-gray">
                    {cert.issuer} {cert.year && `(${cert.year})`}
                  </p>
                  {cert.fileUrl && (
                    <div className="flex items-center gap-3 mt-1">
                      <button
                        onClick={() =>
                          setPreviewCert({
                            url: `/users/me/certifications/${cert._id}/download?disposition=inline`,
                            title: cert.name,
                            fileName: cert.fileName,
                            mimeType: cert.fileMimeType,
                          })
                        }
                        className="flex items-center gap-1 text-teal text-xs hover:underline"
                      >
                        <Eye size={12} />
                        View
                      </button>
                      <button
                        onClick={() => handleDownloadCertification(cert)}
                        className="flex items-center gap-1 text-gray text-xs hover:underline"
                      >
                        <FileText size={12} />
                        Download
                      </button>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleRemoveCertification(cert._id)}
                  className="p-1 hover:bg-gray-100 rounded shrink-0"
                >
                  <X className="text-gray" size={18} />
                </button>
                <button
                  onClick={() => handleOpenEditCertification(cert)}
                  className="p-1 hover:bg-gray-100 rounded shrink-0"
                >
                  <Pencil className="text-gray" size={18} />
                </button>
              </div>
            ))
          ) : (
            <p className="text-gray text-sm text-center py-4 col-span-2">
              No certifications added yet. Click "Add Certification" to get started.
            </p>
          )}
        </div>
      </div>
        </>
      )}

      {/* Identity verification applies to marketplace users, not administrators. */}
      {!isAdmin && (
      <div id="verification" className="bg-white rounded-xl p-6 shadow-sm scroll-mt-24">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="text-teal" size={20} />
              <h2 className="font-family-poppins text-lg font-semibold text-black">
                {teachesSkills ? "Teacher Verification" : "Identity Verification"}
              </h2>
            </div>
            <Badge status={profile.verificationStatus || "unverified"} />
          </div>

          {profile.verificationStatus === "rejected" && profile.verificationRejectionReason && (
            <p className="font-family-poppins text-sm text-red bg-red/5 border border-red/20 rounded-lg p-3 mb-4">
              Rejected: {profile.verificationRejectionReason}
            </p>
          )}

          {profile.verificationStatus === "pending" ? (
            <p className="font-family-poppins text-sm text-gray">
              Your documents are submitted and awaiting admin review.
            </p>
          ) : profile.verificationStatus === "verified" ? (
            <p className="font-family-poppins text-sm text-gray">
              You're verified. Your profile is shown with a badge
              {teachesSkills ? ", and you can take sessions and cash out your earnings." : "."}
            </p>
          ) : (
            <div>
              {/* States the requirement outright. The backend rejects a
                  submission that misses it, so saying it here avoids a
                  round-trip spent being told what was obvious. */}
              <p className="font-family-poppins text-sm text-gray mb-4">
                {teachesSkills
                  ? "Your CNIC is required, plus at least one credential - a degree, transcript, teaching certificate, experience letter or portfolio. Until this is approved you can't take teaching sessions or cash out."
                  : "Your CNIC is required. You can browse, chat and use your free trial session without it, but booking sessions after that needs a verified identity."}
              </p>

              <div className="space-y-2 mb-3">
                {visibleDocSlots.map(({ value, label, hint, recommended }) => {
                  const file = verificationFiles[value];
                  return (
                    <div
                      key={value}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${
                        file ? "border-teal/40 bg-teal/5" : "border-[#E5E5E5]"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-family-poppins text-sm font-medium text-black">
                          {label}
                          {recommended && (
                            <span className="ml-2 font-normal text-xs text-teal">Recommended</span>
                          )}
                        </p>
                        <p className="font-family-poppins text-xs text-gray truncate">
                          {file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB` : hint}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <label className="flex items-center gap-1.5 px-3 py-1.5 border border-[#D0D0D0] rounded-lg cursor-pointer hover:bg-gray-50 font-family-poppins text-xs text-black transition-all">
                          <Upload size={14} />
                          {file ? "Replace" : "Upload"}
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            className="hidden"
                            onChange={(e) => handleVerificationFilePicked(value, e)}
                          />
                        </label>
                        {(file || !recommended) && (
                          <button
                            type="button"
                            onClick={() => removeDocSlot(value, recommended)}
                            className="text-gray hover:text-red-500 transition-colors"
                            aria-label={`Remove ${label}`}
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Only the recommended slots show by default - the rest are
                  added on demand so the form isn't a wall of empty rows. */}
              {remainingDocTypes.length > 0 && (
                <select
                  value=""
                  onChange={(e) => e.target.value && addDocSlot(e.target.value)}
                  className="font-family-poppins text-sm border border-[#D0D0D0] rounded-lg px-3 py-2 bg-white outline-none focus:border-teal mb-3"
                >
                  <option value="">+ Add another document</option>
                  {remainingDocTypes.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              )}

              {verificationFileError && (
                <p className="font-family-poppins text-xs text-red-500 mb-3">
                  {verificationFileError}
                </p>
              )}

              <div className="flex items-center gap-3">
                <Button
                  variant="primary"
                  onClick={handleSubmitVerification}
                  disabled={Boolean(submissionBlocker) || submittingVerification}
                  className="disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submittingVerification ? "Submitting..." : "Submit for Verification"}
                </Button>
                <span className="font-family-poppins text-xs text-gray">
                  {submissionBlocker ||
                    `${selectedVerificationCount} document${selectedVerificationCount === 1 ? "" : "s"} ready`}
                </span>
              </div>
            </div>
          )}
      </div>
      )}

      {/* Modals */}
      <EditProfileModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        user={profile}
      />

      {!isAdmin && (
        <>
          <AddSkillModal
            isOpen={isAddTeachingSkillOpen}
            onClose={() => setIsAddTeachingSkillOpen(false)}
            type="teaching"
            title="Add Skill to Teach"
          />

          <AddSkillModal
            isOpen={isAddLearningSkillOpen}
            onClose={() => setIsAddLearningSkillOpen(false)}
            type="learning"
            title="Add Learning Goal"
          />

          <AddCertificationModal
            isOpen={isAddCertificationOpen}
            onClose={() => setIsAddCertificationOpen(false)}
          />
          <AddCertificationModal
            isOpen={isEditCertificationOpen}
            onClose={() => {
              setIsEditCertificationOpen(false);
              setEditingCert(null);
            }}
            mode="edit"
            initialCert={editingCert}
            onSubmit={handleSubmitEditCertification}
          />
        </>
      )}
      <DocumentViewer
        isOpen={Boolean(previewCert)}
        onClose={() => setPreviewCert(null)}
        url={previewCert?.url}
        title={previewCert?.title}
        fileName={previewCert?.fileName}
        mimeType={previewCert?.mimeType}
        authenticated
      />
    </div>
  );
}

export default ProfilePage;
