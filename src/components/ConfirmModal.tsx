import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  icon?: string;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmStyle?: 'danger' | 'warning' | 'primary';
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  icon = '⚠️',
  title,
  message,
  confirmText = 'Xác nhận',
  cancelText = 'Hủy bỏ',
  confirmStyle = 'danger'
}) => {
  const getConfirmButtonStyle = () => {
    switch (confirmStyle) {
      case 'danger':
        return 'bg-destructive/10 text-destructive hover:bg-destructive/20';
      case 'warning':
        return 'bg-amber-100 text-amber-600 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400';
      case 'primary':
        return 'bg-primary/10 text-primary hover:bg-primary/20';
      default:
        return 'bg-destructive/10 text-destructive hover:bg-destructive/20';
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-background/60 backdrop-blur-sm z-[999]"
          />
          
          {/* Modal Container */}
          <div className="fixed inset-0 flex items-center md:items-center justify-center pointer-events-none z-[1000] px-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-card rounded-[32px] p-8 w-full max-w-[360px] shadow-2xl pointer-events-auto flex flex-col items-center border border-border"
            >
              {/* Icon */}
              <div className="w-[48px] h-[48px] rounded-full bg-primary/10 flex items-center justify-center text-[24px] mb-4">
                {icon}
              </div>

              {/* Title */}
              <h3 className="text-[17px] font-semibold text-foreground mb-2">{title}</h3>

              {/* Message */}
              <p className="text-[13px] text-muted-foreground text-center leading-[1.6] mb-8">
                {message}
              </p>

              {/* Buttons */}
              <div className="w-full flex flex-col gap-3">
                <button
                  onClick={() => {
                    onConfirm();
                    onClose();
                  }}
                  className={`w-full h-[44px] rounded-[12px] font-medium transition-colors ${getConfirmButtonStyle()}`}
                >
                  {confirmText}
                </button>
                <button
                  onClick={onClose}
                  className="w-full h-[44px] rounded-[12px] bg-secondary text-muted-foreground font-medium hover:text-foreground transition-colors"
                >
                  {cancelText}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

export default ConfirmModal;
