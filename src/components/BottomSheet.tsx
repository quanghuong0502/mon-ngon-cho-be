import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  title?: React.ReactNode;
  footer?: React.ReactNode;
}

export default function BottomSheet({ isOpen, onClose, children, className = '', title, footer }: BottomSheetProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleDragEnd = (_: any, info: any) => {
    const shouldClose = info.offset.y > 150 || (info.velocity.y > 500 && info.offset.y > 50);
    if (shouldClose) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[151] flex items-end md:items-center justify-center p-0 md:p-4 overflow-hidden">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          />
          
          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ 
              type: 'spring', 
              damping: 30, 
              stiffness: 300,
              mass: 0.8
            }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            dragDirectionLock
            onDragEnd={handleDragEnd}
            className={`relative w-full md:max-w-5xl bg-card rounded-t-[40px] md:rounded-[40px] shadow-2xl flex flex-col h-[94vh] md:h-[94vh] md:max-h-[94vh] overflow-hidden ${className}`}
          >
            {/* Header / Drag Handle Area */}
            <div className="shrink-0 flex flex-col items-center bg-card z-50">
              <div className="md:hidden w-full flex justify-center py-4 cursor-grab active:cursor-grabbing">
                 <div className="w-12 h-1.5 bg-muted/40 rounded-full" />
              </div>
              
              {title && (
                <div className="w-full px-8 pb-6 bg-card border-b border-border">
                  {title}
                </div>
              )}

              {/* Close Button (Desktop Only) */}
              <button
                onClick={onClose}
                className="hidden md:flex absolute top-6 right-6 z-50 w-10 h-10 bg-secondary rounded-full items-center justify-center text-muted-foreground hover:text-foreground transition-all shadow-sm"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Scrollable Content Container */}
            <div 
              ref={contentRef}
              className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide overscroll-contain"
              onPointerDown={(e) => {
                if (contentRef.current && contentRef.current.scrollTop > 0) {
                  e.stopPropagation();
                }
              }}
            >
              {children}
            </div>

            {/* Footer */}
            {footer && (
              <div className="shrink-0 px-8 py-6 border-t border-border bg-card shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.05)]">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
