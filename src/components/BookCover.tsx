import React, { useState, useEffect } from "react";
import { Book, Sparkles, Sword } from "lucide-react";
import { cn } from "../lib/utils";

export type Category = "book" | "manga" | "gdr";

export interface BookCoverProps {
  title: string;
  author?: string;
  category?: Category;
  system?: string;
  volumeNumber?: number | string;
  coverUrl?: string;
  className?: string;
  imageClassName?: string;
  size?: "sm" | "md" | "lg" | "auto";
  showCategoryBadge?: boolean;
}

export const BookCover: React.FC<BookCoverProps> = ({
  title,
  author,
  category = "book",
  system,
  volumeNumber,
  coverUrl,
  className,
  imageClassName,
  size = "auto",
  showCategoryBadge = true,
}) => {
  const [hasError, setHasError] = useState(false);

  // Reset error state if the coverUrl changes
  useEffect(() => {
    setHasError(false);
  }, [coverUrl]);

  const isValidUrl = Boolean(
    coverUrl &&
      typeof coverUrl === "string" &&
      coverUrl.trim().length > 0 &&
      !hasError,
  );

  if (isValidUrl) {
    return (
      <div className={cn("relative w-full h-full overflow-hidden", className)}>
        <img
          src={coverUrl}
          alt={title}
          className={cn(
            "w-full h-full object-cover transition-transform duration-500 group-hover:scale-105",
            imageClassName,
          )}
          referrerPolicy="no-referrer"
          onError={() => setHasError(true)}
        />
        {/* Subtle dark gradient overlay for depth */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-50 group-hover:opacity-30 transition-opacity pointer-events-none" />
      </div>
    );
  }

  // --- Category Specific Fallback Cover Styling ---
  const config = {
    book: {
      gradient:
        "bg-gradient-to-br from-[#2f1809] via-[#1c0f06] to-[#120a04]",
      border: "border-amber-500/30",
      innerBorder: "border-amber-500/20",
      accent: "text-amber-400",
      titleColor: "text-amber-100",
      authorColor: "text-amber-300/80",
      badgeBg: "bg-amber-950/60 border-amber-500/30 text-amber-300",
      icon: Book,
      label: "Libro",
      fontClass: "font-serif",
      patternColor: "rgba(217, 119, 6, 0.05)",
    },
    manga: {
      gradient:
        "bg-gradient-to-br from-[#240a3d] via-[#150524] to-[#0d0317]",
      border: "border-purple-500/30",
      innerBorder: "border-purple-500/20",
      accent: "text-purple-400",
      titleColor: "text-purple-50",
      authorColor: "text-purple-300/80",
      badgeBg: "bg-purple-950/60 border-purple-500/30 text-purple-300",
      icon: Sparkles,
      label: "Manga",
      fontClass: "font-sans font-black tracking-tight",
      patternColor: "rgba(168, 85, 247, 0.05)",
    },
    gdr: {
      gradient:
        "bg-gradient-to-br from-[#3b0a0f] via-[#1d0508] to-[#110305]",
      border: "border-red-500/30",
      innerBorder: "border-red-500/20",
      accent: "text-red-400",
      titleColor: "text-red-100",
      authorColor: "text-red-300/80",
      badgeBg: "bg-red-950/60 border-red-500/30 text-red-300",
      icon: Sword,
      label: "GDR / RPG",
      fontClass: "font-serif font-bold tracking-wide",
      patternColor: "rgba(239, 68, 68, 0.05)",
    },
  }[category] || {
    gradient: "bg-gradient-to-br from-zinc-800 via-zinc-900 to-black",
    border: "border-white/20",
    innerBorder: "border-white/10",
    accent: "text-zinc-400",
    titleColor: "text-white",
    authorColor: "text-zinc-400",
    badgeBg: "bg-black/50 border-white/20 text-zinc-300",
    icon: Book,
    label: "Libro",
    fontClass: "font-serif",
    patternColor: "rgba(255, 255, 255, 0.05)",
  };

  const Icon = config.icon;

  // Tiny thumbnail format (e.g. Dashboard row w-10 h-14)
  if (size === "sm") {
    return (
      <div
        className={cn(
          "w-full h-full relative overflow-hidden flex flex-col items-center justify-between p-1.5 select-none shadow-md",
          config.gradient,
          className,
        )}
      >
        <div className="w-full flex justify-end">
          <Icon className={cn("w-2.5 h-2.5 opacity-70", config.accent)} />
        </div>
        <p
          className={cn(
            "text-[9px] leading-tight font-bold text-center line-clamp-2 w-full px-0.5",
            config.titleColor,
          )}
          title={title}
        >
          {title}
        </p>
        <div className="w-full h-0.5" />
      </div>
    );
  }

  // Medium format (e.g. mobile horizontal card thumbnail w-20 h-28)
  if (size === "md") {
    return (
      <div
        className={cn(
          "w-full h-full relative overflow-hidden flex flex-col justify-between p-2 select-none shadow-xl border",
          config.gradient,
          config.border,
          className,
        )}
      >
        {/* Spine shadow crease on the left */}
        <div className="absolute top-0 left-0 bottom-0 w-2 bg-gradient-to-r from-black/80 via-black/30 to-transparent pointer-events-none z-10" />

        {/* Top Header */}
        <div className="flex items-center justify-between z-10 pl-1">
          <Icon className={cn("w-3.5 h-3.5 opacity-80", config.accent)} />
          <span className="text-[8px] font-bold uppercase tracking-wider opacity-60 text-white">
            {config.label}
          </span>
        </div>

        {/* Book Title Centered */}
        <div className="my-auto z-10 px-1 py-0.5 text-center">
          <p
            className={cn(
              "text-[11px] leading-tight font-bold line-clamp-3 drop-shadow-md",
              config.fontClass,
              config.titleColor,
            )}
            title={title}
          >
            {title}
          </p>
          {author && (
            <p
              className={cn(
                "text-[8px] truncate mt-1 opacity-80",
                config.authorColor,
              )}
            >
              {author}
            </p>
          )}
        </div>

        {/* Bottom subtle accent */}
        <div className="z-10 flex items-center justify-between text-[7px] text-white/40 pl-1">
          {volumeNumber ? (
            <span className="font-mono font-bold text-white/70">
              Vol. {volumeNumber}
            </span>
          ) : (
            <span className="italic font-serif">NerdShelf</span>
          )}
        </div>
      </div>
    );
  }

  // Standard/Full Card Cover (Aspect ~ 2/3 and responsive)
  return (
    <div
      className={cn(
        "w-full h-full relative overflow-hidden flex flex-col justify-between p-2.5 sm:p-4 select-none shadow-2xl border transition-all duration-300 group-hover:brightness-105",
        config.gradient,
        config.border,
        className,
      )}
    >
      {/* Physical book spine binding crease shadow on the left */}
      <div className="absolute top-0 left-0 bottom-0 w-2 sm:w-3 bg-gradient-to-r from-black/90 via-black/40 to-transparent pointer-events-none z-20" />

      {/* Decorative inner frame */}
      <div
        className={cn(
          "absolute inset-1.5 sm:inset-3 border rounded-lg pointer-events-none z-10 transition-colors",
          config.innerBorder,
        )}
      />

      {/* Subtle background texture pattern */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: `radial-gradient(circle at 50% 30%, ${config.patternColor} 0%, transparent 70%)`,
        }}
      />

      {/* Top Section: Category Badge & Icon */}
      <div className="relative z-20 flex items-center justify-between w-full pl-1">
        {showCategoryBadge && (
          <div
            className={cn(
              "px-1.5 sm:px-2 py-0.5 rounded-md border text-[8px] sm:text-[9px] font-bold tracking-widest uppercase flex items-center gap-1 shadow-sm backdrop-blur-sm",
              config.badgeBg,
            )}
          >
            <Icon className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
            <span>{config.label}</span>
          </div>
        )}

        {volumeNumber && (
          <div className="text-[9px] sm:text-[10px] font-mono font-bold px-1.5 sm:px-2 py-0.5 rounded bg-black/60 border border-white/10 text-white shadow-sm">
            #{volumeNumber}
          </div>
        )}
      </div>

      {/* Center Section: Prominent Book Title */}
      <div className="relative z-20 my-auto py-1 sm:py-2 px-1 text-center flex flex-col items-center justify-center">
        {/* Small ornamental icon emblem */}
        <div className="mb-1.5 sm:mb-2 p-1 sm:p-1.5 rounded-full bg-white/5 border border-white/10 shadow-inner">
          <Icon className={cn("w-3.5 h-3.5 sm:w-5 sm:h-5", config.accent)} />
        </div>

        <h3
          className={cn(
            "text-[11px] sm:text-sm md:text-base font-bold leading-tight sm:leading-snug line-clamp-3 sm:line-clamp-4 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] px-1",
            config.fontClass,
            config.titleColor,
          )}
          title={title}
        >
          {title}
        </h3>

        {/* Author / System */}
        {(author || system) && (
          <p
            className={cn(
              "text-[9px] sm:text-xs mt-1 sm:mt-2 line-clamp-1 max-w-[90%] font-medium",
              config.authorColor,
            )}
          >
            {system || author}
          </p>
        )}
      </div>

      {/* Bottom Section: Footer brand / accent bar */}
      <div className="relative z-20 flex items-center justify-between w-full pt-1 border-t border-white/10 text-[7px] sm:text-[9px] text-white/40 pl-1">
        <span className="font-serif italic tracking-wider text-white/50">
          NerdShelf
        </span>
        <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
      </div>
    </div>
  );
};
