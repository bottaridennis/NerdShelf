import React from 'react';
import { motion } from 'framer-motion';
import { Book as BookIcon, CheckCircle2, Heart } from 'lucide-react';
import { cn } from '../lib/utils';

function stringHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
}

function getColorFromHash(hash: number): string {
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 50%, 30%)`;
}

interface ShelfViewProps {
  items: any[];
  onEdit: (item: any) => void;
}

export function ShelfView({ items, onEdit }: ShelfViewProps) {
  const groupedAndSorted = React.useMemo(() => {
    const arr = [...items];
    arr.sort((a, b) => {
      const seriesA = a.seriesName || a.title;
      const seriesB = b.seriesName || b.title;
      const seriesCmp = seriesA.localeCompare(seriesB);
      if (seriesCmp !== 0) return seriesCmp;
      
      const volA = a.volumeNumber ?? 0;
      const volB = b.volumeNumber ?? 0;
      return volA - volB;
    });
    return arr;
  }, [items]);

  return (
    <div className="w-full h-full pb-16">
      <style>{`
        @media (max-width: 640px) {
          .spine-element {
            --spine-scale: 0.85;
          }
        }
        @media (min-width: 641px) {
          .spine-element {
            --spine-scale: 1;
          }
        }
      `}</style>
      
      <div 
        className="flex flex-wrap content-start w-full min-h-[400px] border-l-[16px] border-r-[16px] border-[var(--shelf-front)] shadow-2xl bg-black/10 rounded-sm"
        style={{
          backgroundImage: `linear-gradient(to bottom, 
            transparent 0px, 
            transparent 332px, 
            var(--shelf-top) 332px, 
            var(--shelf-top) 344px, 
            var(--shelf-front) 344px, 
            var(--shelf-front) 360px,
            rgba(0,0,0,0.6) 360px,
            transparent 375px
          )`,
          backgroundSize: '100% 380px',
        }}
      >
        {/* Fill empty space if there are no items */}
        {groupedAndSorted.length === 0 && (
          <div className="w-full h-[380px] flex items-center justify-center">
            <p className="text-zinc-500 font-serif italic">Your shelf is empty.</p>
          </div>
        )}

        {groupedAndSorted.map((item) => {
          const seriesHash = stringHash(item.seriesName || item.title);
          const seed = Math.abs(seriesHash);
          const height = 240 + (seed % 80);
          
          let thickness = 40;
          if (item.totalPages) {
            thickness = Math.max(24, Math.min(78, (item.totalPages / 300) * 40));
          }

          const hash = stringHash(item.seriesName || item.title);
          const spineColor = getColorFromHash(hash);
          const bookmarkColor = `hsl(${(Math.abs(hash) + 40) % 360}, 80%, 55%)`;
          const isRead = item.status === 'read';
          
          // Calculate dynamic font size based on available height and title length
          const availableHeight = height - 90; // 50px for bottom badge, 40px for top margins/bookmark
          const titleLength = item.title.length;
          // Approximate height of each uppercase character in px is ~0.65 of the font size
          // We want: fontSize * 0.65 * titleLength <= availableHeight
          const calculatedFontSize = availableHeight / (Math.max(1, titleLength) * 0.65);
          const fontSize = Math.max(5.5, Math.min(13, calculatedFontSize)); // Clamp between 7px and 13px


          return (
            <div key={item.id} className="flex items-end justify-center h-[380px] pb-[48px] px-[1px] shrink-0">
              <motion.div
                onClick={() => onEdit(item)}
                whileHover={{ y: -8 }}
                className="spine-element relative cursor-pointer flex flex-col justify-end items-center group transition-shadow rounded-t-[3px] shrink-0"
                style={{
                  height: `calc(${height}px * var(--spine-scale))`,
                  width: `calc(${thickness}px * var(--spine-scale))`,
                  backgroundColor: spineColor,
                  boxShadow: `
                    inset 2px 0 4px rgba(255,255,255,0.15),
                    inset -2px 0 6px rgba(0,0,0,0.5),
                    -3px 0 8px rgba(0,0,0,0.6)
                  `,
                  backgroundImage: `linear-gradient(90deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 15%, rgba(0,0,0,0.2) 85%, rgba(0,0,0,0.5) 100%)`
                }}
              >
                {/* Spines details (ribs) */}
                <div className="absolute top-4 w-full h-[3px] bg-black/40 shadow-[0_1px_1px_rgba(255,255,255,0.2)]" />
                <div className="absolute bottom-16 w-full h-[3px] bg-black/40 shadow-[0_1px_1px_rgba(255,255,255,0.2)]" />
                <div className="absolute bottom-4 w-full h-[3px] bg-black/40 shadow-[0_1px_1px_rgba(255,255,255,0.2)]" />
                
                

                {item.isWishlist && (
                  <div className="absolute top-8 left-0 right-0 flex justify-center z-10">
                    <div className="bg-rose-500 text-white rounded-full p-1 shadow-[0_0_10px_rgba(244,63,94,0.6)]">
                      <Heart className="w-3 h-3 fill-current" />
                    </div>
                  </div>
                )}

                {isRead && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-8 drop-shadow-[0_4px_4px_rgba(0,0,0,0.6)]" style={{ color: bookmarkColor }}>
                      <path d="M5 2V22L12 17L19 22V2Z" />
                    </svg>
                  </div>
                )}

                <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden py-20 px-1">
                  <span 
                    className="spine-text text-white/95 font-serif leading-none uppercase tracking-widest text-center mix-blend-overlay font-bold"
                    style={{ fontSize: `${fontSize}px` }}
                  >
                    {item.title}
                  </span>
                </div>
                
                {item.volumeNumber && (
                  <div className="absolute bottom-5 left-0 right-0 flex justify-center z-10">
                    <div className="w-6 h-6 flex items-center justify-center bg-zinc-900/90 border border-white/20 rounded-full shadow-lg">
                      <span className="text-white font-bold text-[10px] leading-none">{item.volumeNumber}</span>
                    </div>
                  </div>
                )}
              </motion.div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
