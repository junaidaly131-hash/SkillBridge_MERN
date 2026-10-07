import { useEffect, useState } from "react";
import { X } from "lucide-react";

function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  confirmingLabel = "Working...",
  isConfirming,
  danger = true,
}) {
  const [isClosing, setIsClosing] = useState(false);

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
    if (isConfirming) return;
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  };

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${
        isClosing ? "modal-overlay-exit" : "modal-overlay-enter"
      }`}
    >
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      <div
        className={`relative bg-white shadow-xl rounded-2xl w-full max-w-md ${
          isClosing ? "modal-content-exit" : "modal-content-enter"
        }`}
      >
        <div className="p-6 pb-4 border-b border-[#E5E5E5] flex items-center justify-between">
          <h2 className="font-family-poppins text-xl font-bold text-black">{title}</h2>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-all"
            disabled={isConfirming}
          >
            <X className="text-gray" size={24} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="font-family-poppins text-sm text-black">{message}</p>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isConfirming}
              className="font-family-poppins font-medium px-6 py-2.5 rounded-lg transition-all border border-gray text-black hover:bg-dark-blue hover:text-white disabled:opacity-50 disabled:pointer-events-none"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isConfirming}
              className={`font-family-poppins font-medium px-6 py-2.5 rounded-lg transition-all text-white hover:brightness-95 disabled:opacity-50 disabled:pointer-events-none ${
                danger ? "bg-red-600" : "bg-teal-button"
              }`}
            >
              {isConfirming ? confirmingLabel : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ConfirmModal;
