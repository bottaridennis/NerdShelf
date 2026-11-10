import React from 'react';
import { createPortal } from 'react-dom';
import { Handshake, Minus, Plus, Sword, Layers, Check } from 'lucide-react';
import { cn, getVolume } from '../lib/utils';
import { BookCover } from './BookCover';

type Category = 'book' | 'manga' | 'gdr';

interface ShelfItem {
  id: string;
  title: string;
  author?: string;
  category: Category;
  status: 'unread' | 'reading' | 'read';
  seriesName?: string;
  volumeNumber?: number;
  totalVolumes?: string;
  totalPages?: number;
  pagesRead?: number;
  coverUrl?: string;
  system?: string;
  loanedTo?: string;
  isWishlist?: boolean;
}

interface ShelfViewProps {
  items: ShelfItem[];
  onEdit: (item: any) => void;
  onOpenDetails?: (item: any) => void;
  selectionMode?: boolean;
  selectedIds?: string[];
  onSelect?: (id: string) => void;
}

// --- Layout constants (px at zoom 1) ---
const ROW_HEIGHT = 340;
const PLANK_TOP = 10;
const PLANK_FRONT = 14;
const BOOK_BASE = PLANK_TOP + PLANK_FRONT - 4; // books stand on the plank surface
const ZOOM_LEVELS = [0.7, 0.85, 1] as const;

const SECTION_LABELS: Record<Category, string> = {
  book: 'Libri',
  manga: 'Manga',
  gdr: 'Giochi di ruolo',
};

function stringHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (str.charCodeAt(i) + ((hash << 5) - hash)) | 0;
  }
  return Math.abs(hash);
}

const readPref = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const writePref = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
};

interface SpineLayout {
  item: ShelfItem;
  height: number;
  width: number;
  color: string;
  accent: string;
  volume?: number;
  fontSize: number;
  progress: number;
}

// Deterministic look per series: volumes of the same series share color and height.
function computeSpine(item: ShelfItem): SpineLayout {
  const seed = stringHash(item.seriesName || item.title);
  const hue = seed % 360;
  const cat = item.category;

  const height =
    cat === 'manga'
      ? 205 + (seed % 25)
      : cat === 'gdr'
        ? 262 + (seed % 30)
        : 220 + (seed % 70);

  const pages = Number(item.totalPages) || 0;
  const defaultWidth = cat === 'manga' ? 26 : cat === 'gdr' ? 46 : 34;
  const width = pages
    ? Math.round(Math.max(cat === 'manga' ? 22 : 18, Math.min(72, (pages / 300) * (cat === 'manga' ? 30 : 34))))
    : defaultWidth;

  const color =
    cat === 'manga'
      ? `hsl(${hue}, 55%, 38%)`
      : cat === 'gdr'
        ? `hsl(${hue}, 30%, 20%)`
        : `hsl(${hue}, 42%, 27%)`;
  const accent =
    cat === 'gdr' ? 'hsl(42, 70%, 55%)' : cat === 'manga' ? 'rgba(255,255,255,0.92)' : 'hsl(43, 65%, 62%)';

  const volume = getVolume(item);
  // Fit the title vertically in the free area of the spine.
  const free = height - (volume !== undefined ? 92 : 64);
  const fontSize = Math.max(8, Math.min(13, free / (Math.max(1, item.title.length) * 0.66), width * 0.45));

  const progress = pages ? Math.min(1, (Number(item.pagesRead) || 0) / pages) : 0;

  return { item, height, width, color, accent, volume, fontSize, progress };
}

interface SpineProps {
  layout: SpineLayout;
  index: number;
  selected: boolean;
  selectionMode: boolean;
  onActivate: (item: ShelfItem) => void;
  onHover: (layout: SpineLayout | null, el?: HTMLElement) => void;
}

const Spine = React.memo(function Spine({
  layout,
  index,
  selected,
  selectionMode,
  onActivate,
  onHover,
}: SpineProps) {
  const { item, height, width, color, accent, volume, fontSize, progress } = layout;
  const isRead = item.status === 'read';
  const isReading = item.status === 'reading';
  const isLoaned = !!item.loanedTo;
  const cat = item.category;

  const label = [
    item.title,
    volume !== undefined ? `volume ${volume}` : '',
    item.author ? `di ${item.author}` : '',
    isRead ? 'letto' : isReading ? `in lettura ${Math.round(progress * 100)}%` : 'da leggere',
    isLoaned ? `in prestito a ${item.loanedTo}` : '',
  ]
    .filter(Boolean)
    .join(', ');

  const moveFocus = (e: React.KeyboardEvent<HTMLButtonElement>, delta: number) => {
    const root = e.currentTarget.closest('[data-shelf-root]');
    const next = root?.querySelector<HTMLElement>(`[data-spine-index="${index + delta}"]`);
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };

  return (
    <div
      className="relative flex items-end shrink-0 px-[1px]"
      style={{ height: 'calc(var(--row) * 1px)', paddingBottom: `calc(${BOOK_BASE}px * var(--k))` }}
    >
      <button
        type="button"
        data-spine-index={index}
        aria-label={label}
        aria-pressed={selectionMode ? selected : undefined}
        onClick={() => onActivate(item)}
        onMouseEnter={(e) => onHover(layout, e.currentTarget)}
        onMouseLeave={() => onHover(null)}
        onFocus={(e) => onHover(layout, e.currentTarget)}
        onBlur={() => onHover(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') moveFocus(e, 1);
          else if (e.key === 'ArrowLeft') moveFocus(e, -1);
        }}
        className={cn(
          'shelf-spine relative flex flex-col items-center rounded-t-[3px] rounded-b-[1px] overflow-hidden',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-orange)] focus-visible:ring-offset-2 focus-visible:ring-offset-black',
          isReading && 'is-reading',
          isLoaned && 'is-loaned',
          selected && 'is-selected',
        )}
        style={{
          height: `calc(${height}px * var(--k))`,
          width: `calc(${width}px * var(--k))`,
          backgroundColor: isLoaned ? 'transparent' : color,
          ['--spine-accent' as any]: accent,
        }}
      >
        {!isLoaned && (
          <>
            {/* Cylindrical shading */}
            <span
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage:
                  'linear-gradient(90deg, rgba(0,0,0,0.45) 0%, rgba(255,255,255,0.14) 18%, rgba(255,255,255,0.04) 45%, rgba(0,0,0,0.12) 80%, rgba(0,0,0,0.5) 100%)',
              }}
            />

            {/* Category-specific ornaments */}
            {cat === 'manga' ? (
              <span
                aria-hidden
                className="absolute top-0 inset-x-0 flex items-center justify-center font-black text-zinc-900"
                style={{
                  height: `calc(30px * var(--k))`,
                  background: 'rgba(255,255,255,0.88)',
                  fontSize: `calc(${Math.min(13, width * 0.5)}px * var(--k))`,
                }}
              >
                {volume ?? ''}
              </span>
            ) : (
              <>
                <span aria-hidden className="spine-band" style={{ top: `calc(14px * var(--k))` }} />
                <span aria-hidden className="spine-band" style={{ bottom: `calc(14px * var(--k))` }} />
              </>
            )}

            {cat === 'gdr' && (
              <Sword
                aria-hidden
                className="absolute"
                style={{
                  bottom: `calc(26px * var(--k))`,
                  width: `calc(${Math.min(16, width * 0.45)}px * var(--k))`,
                  height: `calc(${Math.min(16, width * 0.45)}px * var(--k))`,
                  color: accent,
                  opacity: 0.85,
                }}
              />
            )}

            {/* Title */}
            <span
              className={cn(
                'absolute inset-x-0 flex items-center justify-center overflow-hidden',
                cat === 'manga' ? 'font-sans font-black tracking-tight' : 'font-serif font-bold tracking-wider uppercase',
              )}
              style={{
                top: `calc(${cat === 'manga' ? 36 : 24}px * var(--k))`,
                bottom: `calc(${volume !== undefined && cat !== 'manga' ? 52 : cat === 'gdr' ? 48 : 24}px * var(--k))`,
                fontSize: `calc(${fontSize}px * var(--k))`,
                color: cat === 'manga' ? '#fff' : accent,
                textShadow: '0 1px 2px rgba(0,0,0,0.8)',
              }}
            >
              <span className="spine-text block max-h-full overflow-hidden text-ellipsis leading-none">
                {item.title}
              </span>
            </span>

            {/* Volume number for non-manga series */}
            {volume !== undefined && cat !== 'manga' && (
              <span
                aria-hidden
                className="absolute flex items-center justify-center rounded-full bg-black/55 border border-white/20 text-white font-bold"
                style={{
                  bottom: `calc(${cat === 'gdr' ? 46 : 24}px * var(--k))`,
                  width: `calc(20px * var(--k))`,
                  height: `calc(20px * var(--k))`,
                  fontSize: `calc(9px * var(--k))`,
                }}
              >
                {volume}
              </span>
            )}

            {/* Reading progress: fill along the right edge */}
            {isReading && progress > 0 && (
              <span
                aria-hidden
                className="absolute right-0 bottom-0 w-[3px] bg-sky-400/90"
                style={{ height: `${progress * 100}%` }}
              />
            )}
          </>
        )}

        {isLoaned && (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-amber-300/80">
            <Handshake aria-hidden style={{ width: `calc(14px * var(--k))`, height: `calc(14px * var(--k))` }} />
            <span
              className="spine-text font-sans font-semibold overflow-hidden text-ellipsis"
              style={{ fontSize: `calc(${Math.min(10, fontSize)}px * var(--k))`, maxHeight: '75%' }}
            >
              {item.loanedTo}
            </span>
          </span>
        )}

        {selectionMode && (
          <span
            aria-hidden
            className={cn(
              'absolute left-1/2 -translate-x-1/2 rounded-full border-2 flex items-center justify-center transition-colors',
              selected
                ? 'bg-[var(--color-brand-orange)] border-[var(--color-brand-orange)] text-white'
                : 'bg-black/40 border-white/70 text-transparent',
            )}
            style={{ bottom: '40%', width: 18, height: 18 }}
          >
            <Check className="w-3 h-3" strokeWidth={3} />
          </span>
        )}
      </button>

      {/* Bookmark ribbon for finished items: sticks out of the top of the book */}
      {isRead && !isLoaned && (
        <svg
          aria-hidden
          viewBox="0 0 10 24"
          className="shelf-ribbon absolute left-1/2 -translate-x-1/2 pointer-events-none"
          style={{
            height: `calc(22px * var(--k))`,
            bottom: `calc(${height + BOOK_BASE - 10}px * var(--k))`,
          }}
        >
          <path d="M0 0H10V24L5 19L0 24Z" fill="hsl(4, 75%, 52%)" />
        </svg>
      )}
    </div>
  );
});

export function ShelfView({
  items,
  onEdit,
  onOpenDetails,
  selectionMode = false,
  selectedIds = [],
  onSelect,
}: ShelfViewProps) {
  const [zoomIndex, setZoomIndex] = React.useState(() => {
    const v = parseInt(readPref('nerdshelf_shelf_zoom', '2'), 10);
    return isNaN(v) ? 2 : Math.min(2, Math.max(0, v));
  });
  const [splitByCategory, setSplitByCategory] = React.useState(
    () => readPref('nerdshelf_shelf_split', '1') === '1',
  );
  const [preview, setPreview] = React.useState<{ layout: SpineLayout; rect: DOMRect } | null>(null);
  const canHover = React.useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches,
    [],
  );

  React.useEffect(() => writePref('nerdshelf_shelf_zoom', String(zoomIndex)), [zoomIndex]);
  React.useEffect(() => writePref('nerdshelf_shelf_split', splitByCategory ? '1' : '0'), [splitByCategory]);

  // Hide the hover preview while scrolling (its position would be stale).
  React.useEffect(() => {
    if (!preview) return;
    const hide = () => setPreview(null);
    window.addEventListener('scroll', hide, { passive: true });
    return () => window.removeEventListener('scroll', hide);
  }, [preview]);

  const layouts = React.useMemo(() => items.map(computeSpine), [items]);

  const sections = React.useMemo(() => {
    if (!splitByCategory) return [{ key: 'all', label: '', layouts }];
    return (['book', 'manga', 'gdr'] as Category[])
      .map((cat) => ({
        key: cat,
        label: SECTION_LABELS[cat],
        layouts: layouts.filter((l) => (l.item.category || 'book') === cat),
      }))
      .filter((s) => s.layouts.length > 0);
  }, [layouts, splitByCategory]);

  const selectedSet = React.useMemo(() => new Set(selectedIds), [selectedIds]);

  const handleActivate = React.useCallback(
    (item: ShelfItem) => {
      setPreview(null);
      if (selectionMode) onSelect?.(item.id);
      else if (onOpenDetails) onOpenDetails(item);
      else onEdit(item);
    },
    [selectionMode, onSelect, onOpenDetails, onEdit],
  );

  const handleHover = React.useCallback(
    (layout: SpineLayout | null, el?: HTMLElement) => {
      if (!canHover || !layout || !el) {
        setPreview(null);
        return;
      }
      setPreview({ layout, rect: el.getBoundingClientRect() });
    },
    [canHover],
  );

  const zoom = ZOOM_LEVELS[zoomIndex];
  const stats = React.useMemo(
    () => ({
      read: items.filter((i) => i.status === 'read').length,
      reading: items.filter((i) => i.status === 'reading').length,
      loaned: items.filter((i) => i.loanedTo).length,
    }),
    [items],
  );

  let spineIndex = 0;

  return (
    <div
      data-shelf-root
      className="shelf-root w-full space-y-6"
      style={{ ['--z' as any]: zoom } as React.CSSProperties}
    >
      {/* Toolbar: legend + display options */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-zinc-400">
        <span className="flex items-center gap-1.5">
          <svg viewBox="0 0 10 24" className="h-3.5" aria-hidden>
            <path d="M0 0H10V24L5 19L0 24Z" fill="hsl(4, 75%, 52%)" />
          </svg>
          Letti · {stats.read}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-3.5 rounded-[2px] bg-zinc-500 -translate-y-0.5 border-r-2 border-sky-400" aria-hidden />
          In lettura (sporgenti) · {stats.reading}
        </span>
        {stats.loaned > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-3.5 rounded-[2px] border border-dashed border-amber-300/70" aria-hidden />
            In prestito · {stats.loaned}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSplitByCategory((v) => !v)}
            aria-pressed={splitByCategory}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-colors font-semibold',
              splitByCategory
                ? 'bg-white/10 border-white/20 text-white'
                : 'border-white/10 text-zinc-400 hover:text-white hover:bg-white/5',
            )}
          >
            <Layers className="w-3.5 h-3.5" />
            Per categoria
          </button>
          <div className="flex items-center rounded-lg border border-white/10 overflow-hidden" role="group" aria-label="Dimensione scaffale">
            <button
              type="button"
              onClick={() => setZoomIndex((z) => Math.max(0, z - 1))}
              disabled={zoomIndex === 0}
              aria-label="Riduci"
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/5 disabled:opacity-30"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 font-mono text-zinc-500 tabular-nums">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoomIndex((z) => Math.min(ZOOM_LEVELS.length - 1, z + 1))}
              disabled={zoomIndex === ZOOM_LEVELS.length - 1}
              aria-label="Ingrandisci"
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/5 disabled:opacity-30"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {sections.map((section) => (
        <section key={section.key} className="space-y-2" aria-label={section.label || 'Scaffale'}>
          {section.label && (
            <h3 className="flex items-baseline gap-2 px-1">
              <span className="text-sm font-serif font-bold text-white">{section.label}</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                {section.layouts.length}
              </span>
            </h3>
          )}
          <div
            className="shelf-case flex flex-wrap content-start w-full rounded-sm"
            style={{ minHeight: 'calc(var(--row) * 1px)' }}
          >
            {section.layouts.map((layout) => (
              <Spine
                key={layout.item.id}
                layout={layout}
                index={spineIndex++}
                selected={selectedSet.has(layout.item.id)}
                selectionMode={selectionMode}
                onActivate={handleActivate}
                onHover={handleHover}
              />
            ))}
          </div>
        </section>
      ))}

      {preview && <ShelfPreview layout={preview.layout} rect={preview.rect} />}
    </div>
  );
}

const STATUS_LABEL = { unread: 'Da leggere', reading: 'In lettura', read: 'Finito' } as const;

function ShelfPreview({ layout, rect }: { layout: SpineLayout; rect: DOMRect }) {
  const { item, volume, progress } = layout;
  const W = 220;
  const H = 150;
  const left = Math.min(window.innerWidth - W - 12, Math.max(12, rect.left + rect.width / 2 - W / 2));
  const above = rect.top > H + 90;
  const top = above ? rect.top - H - 10 : rect.bottom + 10;

  return createPortal(
    <div
      role="tooltip"
      className="fixed z-[45] pointer-events-none flex gap-3 p-3 rounded-2xl bg-zinc-900/95 border border-white/10 shadow-2xl backdrop-blur-xl animate-[fadeIn_120ms_ease-out]"
      style={{ left, top, width: W, height: H }}
    >
      <div className="w-[84px] h-full shrink-0 rounded-lg overflow-hidden border border-white/10 relative">
        <BookCover
          title={item.title}
          author={item.author}
          category={item.category}
          system={item.system}
          volumeNumber={volume}
          coverUrl={item.coverUrl}
          size="md"
        />
      </div>
      <div className="min-w-0 flex flex-col">
        <p className="text-xs font-bold text-white leading-snug line-clamp-3">{item.title}</p>
        {volume !== undefined && <p className="text-[10px] text-zinc-400">Vol. {volume}</p>}
        {item.author && <p className="text-[10px] text-zinc-500 truncate mt-0.5">{item.author}</p>}
        <div className="mt-auto space-y-1">
          {item.loanedTo && (
            <p className="text-[10px] text-amber-300 truncate">In prestito a {item.loanedTo}</p>
          )}
          <p className="text-[10px] font-semibold text-zinc-300">
            {STATUS_LABEL[item.status] || ''}
            {item.status === 'reading' && item.totalPages ? ` · ${Math.round(progress * 100)}%` : ''}
          </p>
          {item.totalPages ? (
            <div className="h-1 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-sky-400" style={{ width: `${progress * 100}%` }} />
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
