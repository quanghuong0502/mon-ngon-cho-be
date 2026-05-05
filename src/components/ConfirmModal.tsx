import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

import { AlertTriangle } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  icon?: React.ReactNode;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmStyle?: 'danger' | 'warning' | 'primary';
  confirmDisabled?: boolean;
  children?: React.ReactNode;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  icon,
  title,
  message,
  confirmText = 'Xác nhận',
  cancelText = 'Hủy bỏ',
  confirmStyle = 'danger',
  confirmDisabled = false,
  children
}) => {
  const getConfirmButtonStyle = () => {
    const disabledClasses = confirmDisabled ? 'opacity-50 cursor-not-allowed shadow-none' : 'shadow-lg hover:opacity-90';
    
    switch (confirmStyle) {
      case 'danger':
        return `bg-primary text-primary-foreground ${disabledClasses}`;
      case 'warning':
        return `bg-amber-500 text-white ${disabledClasses}`;
      case 'primary':
        return `bg-primary text-primary-foreground ${disabledClasses}`;
      default:
        return `bg-primary text-primary-foreground ${disabledClasses}`;
    }
  };

  const getCancelButtonStyle = () => {
    return 'bg-card text-destructive border-destructive/20 shadow-md hover:bg-destructive/5';
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
              <div className="w-[48px] h-[48px] rounded-full bg-primary/10 flex items-center justify-center mb-4">
                {icon || <AlertTriangle size={24} className="text-primary" />}
              </div>

              {/* Title */}
              <h3 className={`text-[18px] font-semibold text-foreground ${message ? "mb-2" : "mb-4"}`}>{title}</h3>

              {/* Message */}
              {message && (
                <p className="text-[14px] text-muted-foreground text-center leading-[1.6] mb-4">
                {message}
              </p>
              )}

              {children && (
                <div className="w-full mb-6">
                  {children}
                </div>
              )}

              {/* Buttons */}
              <div className="w-full flex flex-col gap-3">
                <button
                  disabled={confirmDisabled}
                  onClick={() => {
                    if (!confirmDisabled) {
                      onConfirm();
                      onClose();
                    }
                  }}
                  className={`w-full py-3.5 rounded-xl font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 ${getConfirmButtonStyle()}`}
                >
                  <span className="text-[10px] uppercase tracking-wider">{confirmText}</span>
                </button>
                <button
                  onClick={onClose}
                  className={`w-full py-3.5 rounded-xl font-bold transition-all active:scale-95 border flex items-center justify-center ${getCancelButtonStyle()}`}
                >
                  <span className="text-[10px] uppercase tracking-wider">{cancelText}</span>
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
