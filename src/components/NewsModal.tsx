/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Calendar, ChefHat, Flame } from 'lucide-react';
import { News } from '../types';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { getOptimizedUrl } from '../lib/cloudinary';
import BottomSheet from './BottomSheet';

interface NewsModalProps {
  news: News | null;
  onClose: () => void;
}

export default function NewsModal({ news, onClose }: NewsModalProps) {
  return (
    <BottomSheet isOpen={!!news} onClose={onClose} className="md:max-w-3xl">
      {news && (
        <div className="flex flex-col pb-20 md:pb-0">
          <div className="relative h-64 md:h-80 w-full shrink-0">
            {news.imageUrl ? (
              <img src={getOptimizedUrl(news.imageUrl, 800)} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-accent/20 flex items-center justify-center text-primary">
                <ChefHat size={64} />
              </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8 pt-20 bg-gradient-to-t from-card via-card/80 to-transparent">
              <div className="flex items-center gap-4 text-[10px] font-black uppercase text-primary tracking-widest mb-2">
                <div className="flex items-center gap-1">
                  <Calendar size={14} />
                  {format(news.createdAt.toDate(), 'dd MMMM yyyy', { locale: vi })}
                </div>
                {news.isPinned && (
                  <span className="px-3 py-1 rounded-full bg-destructive/10 text-destructive flex items-center gap-1.5 font-black uppercase tracking-widest text-[9px]">
                    <Flame size={12} className="fill-destructive" />
                    Tin mới
                  </span>
                )}
              </div>
              <h2 className="text-2xl md:text-3xl font-black text-foreground leading-tight">{news.title}</h2>
            </div>
          </div>

          <div className="px-6 md:px-8 pb-12 mt-4">
            <div className="news-content-prose text-left">
              <div 
                dangerouslySetInnerHTML={{ __html: news.content }} 
                className="text-muted-foreground leading-relaxed text-base md:text-lg"
              />
            </div>
          </div>
        </div>
      )}

      <style>{`
        .news-content-prose p { margin-bottom: 8px; font-size: 15px; line-height: 1.7; }
        .news-content-prose strong { font-weight: 500; }
        .news-content-prose ul, .news-content-prose ol { padding-left: 20px; margin-bottom: 8px; list-style-position: inside; }
        .news-content-prose ul { list-style-type: disc; }
        .news-content-prose ol { list-style-type: decimal; }
        .news-content-prose img { max-width: 100%; border-radius: 8px; margin: 12px 0; }
      `}</style>
    </BottomSheet>
  );
}

