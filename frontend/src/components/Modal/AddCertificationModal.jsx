import { useState, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { X, Loader2, Upload, FileText, Image, Trash2 } from "lucide-react";
import Button from "../../ui/Button";
import { addCertification } from "../../store/profileSlice";
import { useToast } from "../../ui/Toast/ToastContext";

function AddCertificationModal({ isOpen, onClose, mode = "add", initialCert = null, onSubmit }) {
  const dispatch = useDispatch();
  const { updateLoading } = useSelector((state) => state.profile);
  const toast = useToast();
  const fileInputRef = useRef(null);

  const [isClosing, setIsClosing] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    issuer: "",
    year: "",
  });
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [error, setError] = useState("");

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 30 }, (_, i) => currentYear - i);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      setFormData({
        name: initialCert?.name || "",
        issuer: initialCert?.issuer || "",
        year: initialCert?.year || "",
      });
      setFile(null);
      setFilePreview(null);
      setError("");
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

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Check file size (10MB limit)
      if (selectedFile.size > 10 * 1024 * 1024) {
        setError("File size must be less than 10MB");
        return;
      }

      setFile(selectedFile);
      setError("");

      // Create preview for images
      if (selectedFile.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = () => {
          setFilePreview({ type: "image", url: reader.result });
        };
        reader.readAsDataURL(selectedFile);
      } else {
        setFilePreview({ type: "file", name: selectedFile.name });
      }
    }
  };

  const handleRemoveFile = () => {
    setFile(null);
    setFilePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!formData.name.trim()) {
      setError("Please enter a certification name");
      return;
    }

    try {
      if (onSubmit) {
        await onSubmit({
          name: formData.name.trim(),
          issuer: formData.issuer.trim(),
          year: formData.year,
          file: file,
        });
        toast.success(`Certification "${formData.name.trim()}" updated successfully!`);
      } else {
        await dispatch(
          addCertification({
            name: formData.name.trim(),
            issuer: formData.issuer.trim(),
            year: formData.year,
            file: file,
          })
        ).unwrap();
        toast.success(`Certification "${formData.name.trim()}" added successfully!`);
      }
      handleClose();
    } catch (err) {
      setError(err || "Failed to add certification");
      toast.error(err || "Failed to add certification");
    }
  };

  const getFileIcon = () => {
    if (!file) return null;
    if (file.type.startsWith("image/")) {
      return <Image className="text-teal" size={20} />;
    }
    return <FileText className="text-teal" size={20} />;
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
          {mode === "edit" ? "Edit Certification" : "Add Certification"}
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
          {/* Certification Name */}
          <div>
            <label className="font-family-poppins text-sm font-medium text-gray block mb-2">
              Certification Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="e.g., AWS Solutions Architect"
              className="w-full px-4 py-3 border border-[#D0D0D0] rounded-lg font-family-poppins text-sm outline-none focus:border-teal"
              autoFocus
            />
          </div>

          {/* Issuer */}
          <div>
            <label className="font-family-poppins text-sm font-medium text-gray block mb-2">
              Issuing Organization
            </label>
            <input
              type="text"
              value={formData.issuer}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, issuer: e.target.value }))
              }
              placeholder="e.g., Amazon Web Services"
              className="w-full px-4 py-3 border border-[#D0D0D0] rounded-lg font-family-poppins text-sm outline-none focus:border-teal"
            />
          </div>

          {/* Year */}
          <div>
            <label className="font-family-poppins text-sm font-medium text-gray block mb-2">
              Year Obtained
            </label>
            <select
              value={formData.year}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, year: e.target.value }))
              }
              className="w-full px-4 py-3 border border-[#D0D0D0] rounded-lg font-family-poppins text-sm outline-none focus:border-teal bg-white"
            >
              <option value="">Select year</option>
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          {/* File Upload */}
          <div>
            <label className="font-family-poppins text-sm font-medium text-gray block mb-2">
              Certificate File (Optional)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.doc,.docx"
              onChange={handleFileChange}
              className="hidden"
            />

            {!filePreview ? (
              <div
                onClick={handleFileClick}
                className="border-2 border-dashed border-[#D0D0D0] rounded-lg p-6 text-center cursor-pointer hover:border-teal transition-colors"
              >
                <Upload className="mx-auto text-gray mb-2" size={32} />
                <p className="font-family-poppins text-sm text-gray">
                  Click to upload certificate
                </p>
                <p className="font-family-poppins text-xs text-gray mt-1">
                  PDF, DOC, DOCX, PNG, JPG (max 10MB)
                </p>
              </div>
            ) : (
              <div className="border border-[#E5E5E5] rounded-lg p-4">
                <div className="flex items-center gap-3">
                  {filePreview.type === "image" ? (
                    <img
                      src={filePreview.url}
                      alt="Preview"
                      className="w-16 h-16 object-cover rounded-lg"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-teal/10 rounded-lg flex items-center justify-center">
                      {getFileIcon()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-family-poppins text-sm font-medium text-black truncate">
                      {file?.name}
                    </p>
                    <p className="font-family-poppins text-xs text-gray">
                      {(file?.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveFile}
                    className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="text-red-500" size={18} />
                  </button>
                </div>
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
              {updateLoading
                ? mode === "edit"
                  ? "Saving..."
                  : "Adding..."
                : mode === "edit"
                ? "Save Changes"
                : "Add Certification"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddCertificationModal;
