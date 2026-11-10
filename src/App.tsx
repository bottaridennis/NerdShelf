/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  User,
} from "firebase/auth";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  orderBy,
  getDocFromServer,
  deleteField,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import {
  searchOpenLibrary,
  searchAniList,
  searchMangaDex,
  lookupIsbn,
  type CoverResult,
} from "./services/apiService";
import {
  Book,
  Sword,
  Sparkles,
  Plus,
  LogOut,
  Search,
  Filter,
  CheckCircle2,
  Trash2,
  ChevronRight,
  X,
  Pencil,
  Scan,
  Heart,
  Layers,
  Handshake,
  Edit3,
  Download,
  Upload,
  User as UserIcon,
  ShoppingBag,
  Check,
  AlertTriangle,
  LayoutGrid,
  BarChart3,
  FileSpreadsheet,
  Loader2,
  ListChecks,
  Info,
} from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { motion, AnimatePresence } from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Logo } from "./components/Logo";
import { ShelfView } from "./components/ShelfView";
import { BookCover } from "./components/BookCover";
import { getVolume } from "./lib/utils";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Normalises Firestore Timestamps, Dates, serialized timestamps ({seconds})
// coming from JSON backups and ISO strings into a Date.
const toDate = (date: any): Date | null => {
  if (!date) return null;
  if (typeof date.toDate === "function") return date.toDate();
  if (date instanceof Date) return date;
  if (typeof date === "object" && typeof date.seconds === "number") {
    return new Date(date.seconds * 1000);
  }
  const parsed = new Date(date);
  return isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (date: any) => {
  const d = toDate(date);
  return d ? d.toLocaleDateString() : "";
};

const daysSince = (date: any): number | null => {
  const d = toDate(date);
  if (!d) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
};

const formatPrice = (price: any) => {
  const n = Number(price);
  return isNaN(n) ? "€0.00" : `€${n.toFixed(2)}`;
};


// Returns missing volume numbers between 1 and the highest owned volume.
const findMissingVolumes = (volumes: number[]) => {
  if (volumes.length === 0) return [];
  const owned = new Set(volumes);
  const max = Math.max(...volumes);
  const missing: number[] = [];
  for (let v = 1; v <= max && missing.length < 50; v++) {
    if (!owned.has(v)) missing.push(v);
  }
  return missing;
};

const compressRanges = (nums: number[]) => {
  const parts: string[] = [];
  let i = 0;
  while (i < nums.length) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    parts.push(i === j ? `${nums[i]}` : `${nums[i]}–${nums[j]}`);
    i = j + 1;
  }
  return parts.join(", ");
};

// Closes overlays on Escape.
const useEscapeKey = (active: boolean, handler: () => void) => {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handler();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, handler]);
};

// Locks page scroll while a modal is open.
const useBodyScrollLock = (active: boolean) => {
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
};

// Enter submits a form only from single-line inputs, never from textareas or
// inputs that handle Enter themselves (e.g. tag entry).
const isPlainEnterSubmit = (e: React.KeyboardEvent) => {
  if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return false;
  const target = e.target as HTMLElement;
  if (target.tagName === "TEXTAREA") return false;
  if (target.dataset.enterHandled === "true") return false;
  if (target.tagName === "BUTTON") return false;
  return true;
};

enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  };
}

function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  // Surface the error to the user via the app-level toast instead of crashing
  // the whole UI through the ErrorBoundary.
  firestoreErrorListener?.(errInfo);
}

let firestoreErrorListener: ((info: FirestoreErrorInfo) => void) | null = null;

const describeFirestoreError = (info: FirestoreErrorInfo) => {
  const msg = info.error.toLowerCase();
  if (msg.includes("permission")) return "Permesso negato dal database.";
  if (msg.includes("offline") || msg.includes("network") || msg.includes("unavailable")) {
    return "Sei offline: le modifiche verranno sincronizzate appena possibile.";
  }
  return "Si è verificato un errore durante il salvataggio.";
};

// --- Types ---
type Category = "book" | "manga" | "gdr";
type Status = "unread" | "reading" | "read";
type SortOption = "title" | "author" | "status" | "date" | "volume" | "series" | "rating";

interface LibraryItem {
  id: string;
  userId: string;
  title: string;
  author: string;
  category: Category;
  status: Status;
  genre?: string;
  price?: number;
  isbn?: string;
  totalVolumes?: string;
  system?: string;
  totalPages?: number;
  pagesRead?: number;
  coverUrl?: string;
  isWishlist?: boolean;
  seriesName?: string;
  loanedTo?: string;
  loanDate?: any;
  description?: string;
  notes?: string;
  rating?: number;
  review?: string;
  tags?: string[];
  volumeNumber?: number;
  volumeCount?: number;
  createdAt: any;
}

// --- Components ---

export class ErrorBoundary extends React.Component<any, any> {
  state: any = { hasError: false, errorInfo: null };
  props: any;

  constructor(props: any) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(error: any) {
    try {
      const info = JSON.parse(error.message);
      return { hasError: true, errorInfo: info };
    } catch {
      return { hasError: true, errorInfo: { error: error.message } };
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-transparent flex items-center justify-center p-6">
          <div className="glass-card p-8 rounded-[2rem] border border-red-200 max-w-lg w-full space-y-6 text-center">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto">
              <X className="w-8 h-8 text-red-500" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-serif font-bold text-white">
                Ops! Qualcosa è andato storto
              </h2>
              <p className="text-zinc-500 text-sm">
                Si è verificato un errore durante la comunicazione con il
                database.
              </p>
            </div>
            {this.state.errorInfo && (
              <div className="bg-white/5 p-4 rounded-xl text-left overflow-hidden">
                <p className="text-[10px] uppercase font-bold text-red-500 tracking-widest mb-2">
                  Dettagli Tecnici
                </p>
                <pre className="text-[10px] text-zinc-500 font-mono whitespace-pre-wrap break-all">
                  {JSON.stringify(this.state.errorInfo, null, 2)}
                </pre>
              </div>
            )}
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-white text-zinc-900 font-bold rounded-xl hover:bg-white/10 transition-all"
            >
              Ricarica App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const ISBNScanner = ({
  onScan,
  onClose,
}: {
  onScan: (isbn: string) => void;
  onClose: () => void;
}) => {
  const [error, setError] = useState<string | null>(null);
  const [isStarted, setIsStarted] = useState(false);
  const [scanner, setScanner] = useState<Html5Qrcode | null>(null);
  useEscapeKey(true, onClose);

  useEffect(() => {
    const newScanner = new Html5Qrcode("reader");
    setScanner(newScanner);
    return () => {
      if (newScanner.isScanning) {
        newScanner.stop().catch(() => {});
      }
    };
  }, []);

  const startScanner = async () => {
    if (!scanner) return;
    setError(null);
    try {
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 150 } },
        (decodedText) => {
          onScan(decodedText.replace(/[^0-9Xx]/g, "") || decodedText);
          scanner
            .stop()
            .then(() => onClose())
            .catch(() => onClose());
        },
        () => {}, // ignore scan errors
      );
      setIsStarted(true);
    } catch (err: any) {
      console.error("Scanner start error:", err);
      if (
        err?.toString().includes("NotAllowedError") ||
        err?.toString().includes("Permission denied")
      ) {
        setError(
          "Il browser ha bloccato l'accesso alla fotocamera. Per risolvere:\n1. Tocca l'icona della fotocamera nella barra degli indirizzi\n2. Scegli 'Consenti sempre'\n3. Ricarica la pagina.",
        );
      } else {
        setError("Impossibile avviare la fotocamera. Assicurati che nessun'altra app la stia usando.");
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl">
      <div className="bg-zinc-900 border border-white/10 w-full max-w-md rounded-[2.5rem] p-6 sm:p-8 space-y-6 shadow-2xl">
        <div className="flex justify-between items-center">
          <div className="space-y-1">
            <h3 className="text-xl font-serif font-bold text-white">
              Scanner ISBN
            </h3>
            <p className="text-[11px] text-zinc-500">
              Inquadra il codice a barre sul retro del libro
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Chiudi scanner"
            className="p-2 text-zinc-500 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="relative aspect-video bg-black/40 rounded-3xl overflow-hidden border border-white/10 ring-1 ring-white/50/10">
          <div id="reader" className="w-full h-full"></div>

          {!isStarted && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4 bg-white/5 backdrop-blur-sm">
              <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                <Scan className="w-8 h-8 text-zinc-500" />
              </div>
              <button
                onClick={startScanner}
                className="px-6 py-2.5 bg-white text-zinc-900 text-xs font-bold uppercase tracking-widest rounded-full hover:bg-white/10 transition-all"
              >
                Avvia fotocamera
              </button>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center space-y-4 bg-red-950/20 backdrop-blur-md">
              <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <X className="w-6 h-6 text-red-500" />
              </div>
              <p className="text-xs text-red-200 font-medium leading-relaxed whitespace-pre-line">
                {error}
              </p>
              <button
                onClick={() => window.location.reload()}
                className="text-[10px] font-bold text-white underline underline-offset-4 uppercase tracking-widest"
              >
                Ricarica pagina
              </button>
            </div>
          )}

          {isStarted && (
            <div className="absolute inset-0 pointer-events-none border-[20px] border-black/40">
              <div className="w-full h-full border border-white/20 rounded-xl relative">
                <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-white/30"></div>
                <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-white/30"></div>
                <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-white/30"></div>
                <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-white/30"></div>
                <div className="absolute top-1/2 left-0 w-full h-[1px] bg-red-500/30 animate-pulse"></div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center space-x-2 text-[9px] text-zinc-500 font-bold uppercase tracking-[0.3em]">
          <div
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              isStarted ? "bg-green-500 animate-pulse" : "bg-zinc-800",
            )}
          ></div>
          <span>{isStarted ? "Scansione attiva" : "In attesa"}</span>
        </div>
      </div>
    </div>
  );
};

const AuthScreen = () => {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    setIsSigningIn(true);
    setLoginError(null);
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Login failed:", error);
      if (error?.code === "auth/popup-closed-by-user" || error?.code === "auth/cancelled-popup-request") {
        // user dismissed the popup: nothing to report
      } else if (error?.code === "auth/popup-blocked") {
        setLoginError("Il browser ha bloccato il popup di accesso. Consenti i popup per questo sito e riprova.");
      } else {
        setLoginError("Accesso non riuscito. Controlla la connessione e riprova.");
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Dynamic Background Effects */}
      <div className="absolute inset-0 pointer-events-none z-[0] overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] bg-purple-900/20 rounded-full blur-[120px] mix-blend-screen opacity-50 animate-pulse-slow"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[70vw] h-[70vw] bg-red-900/20 rounded-full blur-[120px] mix-blend-screen opacity-50 animate-pulse-slow delay-1000"></div>
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] mix-blend-overlay"></div>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-8 max-w-md w-full relative z-10"
      >
        <div className="space-y-4">
          <div className="flex justify-center">
            <Logo className="w-24 h-24" />
          </div>
          <div className="space-y-2">
            <h1 className="text-6xl font-serif font-bold text-white tracking-tighter">
              Nerd<span className="text-[var(--color-brand-orange)]">Shelf</span>
            </h1>
            <p className="text-zinc-500 text-lg font-light">
              Il tuo rifugio personale per classici, manga e manuali di gioco di ruolo.
            </p>
          </div>
        </div>

        <div className="glass-card p-8 rounded-3xl space-y-6">
          <div className="flex justify-center space-x-4">
            <Book className="w-8 h-8 text-amber-600" />
            <Sparkles className="w-8 h-8 text-purple-600" />
            <Sword className="w-8 h-8 text-red-700" />
          </div>

          <button
            onClick={handleLogin}
            disabled={isSigningIn}
            className="w-full py-4 px-6 bg-white text-zinc-900 font-semibold rounded-2xl hover:bg-zinc-200 transition-all flex items-center justify-center space-x-3 shadow-xl disabled:opacity-70"
          >
            {isSigningIn ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <img
                src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                className="w-5 h-5"
                alt="Google"
              />
            )}
            <span>{isSigningIn ? "Apro i cancelli..." : "Entra con Google"}</span>
          </button>

          {loginError && (
            <p role="alert" className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
              {loginError}
            </p>
          )}

          <p className="text-xs text-zinc-500 uppercase tracking-widest">
            La tua collezione, sincronizzata su ogni dispositivo
          </p>
        </div>
      </motion.div>
    </div>
  );
};

const CategoryChip = ({
  label,
  active,
  onClick,
  colorClass,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  colorClass: string;
  key?: React.Key;
}) => (
  <button
    onClick={onClick}
    aria-pressed={active}
    className={cn(
      "px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap border border-white/10 shrink-0",
      active ? colorClass : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200",
    )}
  >
    {label}
  </button>
);

const StarRating = ({
  rating,
  setRating,
  readonly = false,
}: {
  rating: number;
  setRating?: (rating: number) => void;
  readonly?: boolean;
}) => {
  return (
    <div className="flex items-center space-x-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          aria-label={readonly ? undefined : `${star} ${star === 1 ? "stella" : "stelle"}${star === rating ? " (tocca di nuovo per rimuovere)" : ""}`}
          title={readonly ? undefined : `${star}/5`}
          onClick={() => setRating?.(star === rating ? 0 : star)}
          className={cn(
            "p-1 transition-all",
            readonly ? "cursor-default" : "cursor-pointer hover:scale-110",
            star <= rating
              ? "text-amber-400"
              : "text-zinc-600 hover:text-zinc-400",
          )}
        >
          <Sparkles
            className={cn(
              "w-4 h-4",
              star <= rating &&
                "fill-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]",
            )}
          />
        </button>
      ))}
    </div>
  );
};

const ItemCard = ({
  item,
  onOpenDetails,
  onEdit,
  onMarkAsBought,
  isSelected,
  onSelect,
  selectionMode,
}: {
  item: LibraryItem;
  onOpenDetails: (item: LibraryItem) => void;
  onEdit?: (item: LibraryItem) => void;
  onMarkAsBought?: (item: LibraryItem) => void;
  key?: React.Key;
  isSelected?: boolean;
  onSelect?: (id: string) => void;
  selectionMode?: boolean;
}) => {
  const categoryConfig = {
    book: {
      icon: Book,
      color: "text-amber-600",
      progressColor: "bg-amber-600 shadow-[0_0_8px_rgba(217,119,6,0.8)]",
      border: "category-book",
      label: "Libro",
    },
    manga: {
      icon: Sparkles,
      color: "text-purple-600",
      progressColor: "bg-purple-600 shadow-[0_0_8px_rgba(147,51,234,0.8)]",
      border: "category-manga",
      label: "Manga",
    },
    gdr: {
      icon: Sword,
      color: "text-red-700",
      progressColor: "bg-red-700 shadow-[0_0_8px_rgba(185,28,28,0.8)]",
      border: "category-gdr",
      label: "GDR",
    },
  };

  const statusBadgeConfig: Record<Status, { label: string; color: string }> = {
    unread: { label: "Da leggere", color: "text-zinc-400 bg-white/5 border-white/10" },
    reading: { label: "In lettura", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
    read: { label: "Finito", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  };

  const config = categoryConfig[item.category] || categoryConfig.book;
  const volume = getVolume(item);
  const statusBadge = statusBadgeConfig[item.status] || statusBadgeConfig.unread;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -5 }}
      role="button"
      tabIndex={0}
      aria-pressed={selectionMode ? !!isSelected : undefined}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (selectionMode) onSelect?.(item.id);
          else onOpenDetails(item);
        }
      }}
      onClick={() => {
        if (selectionMode) {
          onSelect?.(item.id);
        } else {
          onOpenDetails(item);
        }
      }}
      className={cn(
        "glass-card p-4 rounded-2xl flex flex-row sm:flex-col items-center sm:items-stretch space-x-4 sm:space-x-0 sm:space-y-4 group relative overflow-hidden cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-orange)]",
        config.border,
        isSelected && "ring-2 ring-[var(--color-brand-orange)] border-transparent bg-white/10",
      )}
    >
      <div
        className="w-20 h-28 sm:w-full sm:h-auto sm:aspect-[2/3] flex-shrink-0 bg-black/40 rounded-xl overflow-hidden relative shadow-2xl border border-white/10 group-hover:border-white/20 transition-all text-left"
      >
        <BookCover
          title={item.title}
          author={item.author}
          category={item.category}
          system={item.system}
          volumeNumber={volume}
          coverUrl={item.coverUrl}
        />
        {item.loanedTo && (
          <div
            className="absolute bottom-2 left-2 bg-amber-500 text-white text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded shadow-lg z-30 flex items-center gap-1 max-w-[70%]"
            title={`In prestito a ${item.loanedTo}`}
          >
            <Handshake className="w-2.5 h-2.5 shrink-0" />
            <span className="truncate">{item.loanedTo}</span>
          </div>
        )}
        {item.isWishlist && (
          <div className="absolute top-2 right-2 bg-rose-500/90 text-white p-1 rounded-full shadow-lg z-30">
            <Heart className="w-3 h-3 fill-white" />
          </div>
        )}
        {volume !== undefined && item.coverUrl && (
          <div className="absolute bottom-2 right-2 bg-zinc-900/90 border border-white/20 text-white min-w-7 h-7 px-1 rounded-full shadow-lg flex items-center justify-center backdrop-blur-sm z-30">
            <span className="font-bold text-[11px] leading-none">{volume}</span>
          </div>
        )}
        {selectionMode && (
          <div
            className={cn(
              "absolute inset-0 flex items-center justify-center transition-all z-30",
              isSelected
                ? "bg-white/20"
                : "bg-white/5 opacity-0 group-hover:opacity-100",
            )}
          >
            <div
              className={cn(
                "w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all",
                isSelected
                  ? "bg-[var(--color-brand-orange)] border-[var(--color-brand-orange)] text-white"
                  : "border-white text-transparent",
              )}
            >
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-between h-full sm:min-h-[100px]">
        <div className="flex justify-between items-start gap-2">
          <div className="min-w-0">
            <h3 className="text-base font-medium text-white leading-tight line-clamp-2 sm:h-10">
              {item.title}
            </h3>
            {/* Mobile Author */}
            <p className="text-xs text-zinc-500 truncate sm:hidden mt-1">
              {item.author}
            </p>
          </div>
          {/* Mobile Volume Badge */}
          <div className="sm:hidden">
            {volume !== undefined && (
              <span className="text-[9px] font-bold bg-purple-900/30 text-purple-400 px-1.5 py-0.5 rounded border border-purple-700/30 shrink-0">
                Vol. {volume}
              </span>
            )}
          </div>
        </div>

        {/* Desktop Footer / Bottom Row */}
        <div className="flex flex-col mt-auto pt-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-500 truncate flex-1 mr-2 hidden sm:block">
              {item.author}
            </p>

            <div className="hidden sm:flex items-center space-x-2">
              <span
                className={cn(
                  "text-[9px] uppercase tracking-widest font-bold",
                  config.color,
                )}
              >
                {config.label}
              </span>
              {volume !== undefined && (
                <span className="text-[9px] font-bold bg-purple-900/30 text-purple-400 px-1.5 py-0.5 rounded border border-purple-700/30 shrink-0">
                  Vol. {volume}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between mt-1">
            {item.rating ? (
              <div className="flex items-center space-x-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Sparkles
                    key={star}
                    className={cn(
                      "w-3 h-3",
                      star <= item.rating!
                        ? "fill-amber-400 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]"
                        : "text-white/10",
                    )}
                  />
                ))}
              </div>
            ) : (
              <div />
            )}
            {item.tags && item.tags.length > 0 && (
              <div className="hidden sm:flex items-center space-x-1 shrink-0 ml-2">
                <span className="bg-white/5 border border-white/10 text-zinc-400 text-[8px] px-1.5 py-0.5 rounded uppercase tracking-widest truncate max-w-[60px]">
                  {item.tags[0]}
                </span>
                {item.tags.length > 1 && (
                  <span className="text-zinc-600 text-[8px]">
                    +{item.tags.length - 1}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-white/5">
            <span
              className={cn(
                "text-[8px] sm:text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border",
                statusBadge.color,
              )}
            >
              {statusBadge.label}
            </span>

            {onEdit && !selectionMode && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(item);
                }}
                className="p-1 rounded-lg text-zinc-500 hover:text-white hover:bg-white/10 transition-colors opacity-80 sm:opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                title="Modifica"
                aria-label={`Modifica ${item.title}`}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {item.totalPages && item.totalPages > 0 ? (
          <div className="mt-3 space-y-1">
            <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-widest px-0.5">
              <span className="text-zinc-600">Progresso</span>
              <span className="text-zinc-400">
                {Math.round(((item.pagesRead || 0) / item.totalPages) * 100)}%
              </span>
            </div>
            <div className="w-full bg-black/40 h-1.5 rounded-full overflow-hidden border border-white/5">
              <div
                className={cn(
                  "h-full transition-all duration-700 ease-out",
                  config.progressColor,
                )}
                style={{
                  width: `${Math.min(100, ((item.pagesRead || 0) / item.totalPages) * 100)}%`,
                }}
              />
            </div>
          </div>
        ) : null}

        {item.isWishlist && onMarkAsBought && !selectionMode && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMarkAsBought(item);
            }}
            className="w-full mt-3 py-2 px-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer group/buy"
            title="Segna come comprato e sposta nella libreria"
          >
            <ShoppingBag className="w-3.5 h-3.5 group-hover/buy:scale-110 transition-transform" />
            <span>Segna come comprato</span>
          </button>
        )}
      </div>
    </motion.div>
  );
};

const inputClass =
  "w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-base sm:text-sm text-white focus:outline-none focus:border-white/30 focus:bg-white/[0.07] placeholder:text-zinc-500 transition-colors";
const labelClass =
  "text-[9px] uppercase tracking-widest text-zinc-500 font-bold";

const FieldLabel = ({
  children,
  htmlFor,
}: {
  children: React.ReactNode;
  htmlFor?: string;
}) => (
  <label htmlFor={htmlFor} className={labelClass}>
    {children}
  </label>
);

const ToggleSwitch = ({
  checked,
  onChange,
  activeClass,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  activeClass: string;
  label: string;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    className={cn(
      "w-11 h-6 rounded-full transition-all relative shrink-0",
      checked ? activeClass : "bg-zinc-700",
    )}
  >
    <span
      className={cn(
        "absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all",
        checked ? "left-6" : "left-1",
      )}
    />
  </button>
);

const emptyForm = () => ({
  title: "",
  author: "",
  category: "book" as Category,
  status: "unread" as Status,
  genre: "",
  price: "" as string | number,
  isbn: "",
  totalVolumes: "",
  volumeNumber: "" as string | number,
  volumeCount: "" as string | number,
  system: "",
  totalPages: "" as string | number,
  pagesRead: "" as string | number,
  coverUrl: "",
  isWishlist: false,
  seriesName: "",
  loanedTo: "",
  loanDate: null as any,
  description: "",
  notes: "",
  rating: 0,
  review: "",
  tags: [] as string[],
});

const BOOK_GENRES = [
  "Novel",
  "Fantasy",
  "Sci-Fi",
  "Thriller",
  "Horror",
  "Poetry",
  "Biography",
  "History",
  "Cookbook",
  "Other",
];

const ItemModal = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  preset,
  existingItems = [],
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  initialData?: LibraryItem | null;
  preset?: Partial<LibraryItem> | null;
  existingItems?: LibraryItem[];
}) => {
  const [formData, setFormData] = useState(emptyForm);
  const [coverResults, setCoverResults] = useState<CoverResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchFeedback, setSearchFeedback] = useState<string | null>(null);
  const [isLookingUpIsbn, setIsLookingUpIsbn] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [bulkCount, setBulkCount] = useState(1);
  const [tagDraft, setTagDraft] = useState("");
  const [showMore, setShowMore] = useState(false);

  const isEditing = Boolean(initialData);

  useEscapeKey(isOpen && !showScanner, onClose);
  useBodyScrollLock(isOpen);

  const suggestions = useMemo(() => {
    const authors = new Set<string>();
    const series = new Set<string>();
    const tags = new Set<string>();
    const systems = new Set<string>();
    existingItems.forEach((i) => {
      if (i.author) authors.add(i.author);
      if (i.seriesName) series.add(i.seriesName);
      if (i.system) systems.add(i.system);
      (i.tags || []).forEach((t) => tags.add(t));
    });
    const sort = (set: Set<string>) =>
      Array.from(set).sort((a, b) => a.localeCompare(b));
    return {
      authors: sort(authors),
      series: sort(series),
      tags: sort(tags),
      systems: sort(systems),
    };
  }, [existingItems]);

  const update = (patch: Partial<ReturnType<typeof emptyForm>>) =>
    setFormData((prev) => ({ ...prev, ...patch }));

  useEffect(() => {
    if (!isOpen) return;
    setCoverResults([]);
    setSearchFeedback(null);
    setIsBulkMode(false);
    setBulkCount(1);
    setTagDraft("");

    if (initialData) {
      // Older entries stored the volume number in the free-text `totalVolumes`
      // field: migrate it into `volumeNumber` when editing.
      const legacyVolume = parseInt(initialData.totalVolumes || "", 10);
      const migrateLegacy =
        initialData.volumeNumber === undefined &&
        !isNaN(legacyVolume) &&
        String(legacyVolume) === String(initialData.totalVolumes).trim();
      setFormData({
        ...emptyForm(),
        title: initialData.title || "",
        author: initialData.author || "",
        category: initialData.category || "book",
        status: initialData.status || "unread",
        genre: initialData.genre || "",
        price: initialData.price ?? "",
        isbn: initialData.isbn || "",
        totalVolumes: migrateLegacy ? "" : initialData.totalVolumes || "",
        volumeNumber: migrateLegacy
          ? legacyVolume
          : (initialData.volumeNumber ?? ""),
        volumeCount: initialData.volumeCount ?? "",
        system: initialData.system || "",
        totalPages: initialData.totalPages ?? "",
        pagesRead: initialData.pagesRead ?? "",
        coverUrl: initialData.coverUrl || "",
        isWishlist: initialData.isWishlist || false,
        seriesName: initialData.seriesName || "",
        loanedTo: initialData.loanedTo || "",
        loanDate: initialData.loanDate || null,
        description: initialData.description || "",
        notes: initialData.notes || "",
        rating: initialData.rating || 0,
        review: initialData.review || "",
        tags: initialData.tags || [],
      });
      setShowMore(
        Boolean(
          initialData.notes ||
            initialData.review ||
            initialData.rating ||
            initialData.price !== undefined ||
            (initialData.tags && initialData.tags.length),
        ),
      );
    } else {
      setFormData({
        ...emptyForm(),
        ...(preset?.category ? { category: preset.category } : {}),
        ...(preset?.isWishlist ? { isWishlist: true } : {}),
        ...(preset?.seriesName ? { seriesName: preset.seriesName } : {}),
        ...(preset?.author ? { author: preset.author } : {}),
        ...(preset?.volumeNumber ? { volumeNumber: preset.volumeNumber } : {}),
      });
      setShowMore(false);
    }
  }, [initialData, preset, isOpen]);

  const duplicate = useMemo(() => {
    const title = formData.title.trim().toLowerCase();
    if (!title) return null;
    const vol = parseInt(String(formData.volumeNumber), 10);
    return (
      existingItems.find((i) => {
        if (initialData && i.id === initialData.id) return false;
        if (i.title.trim().toLowerCase() !== title) return false;
        const iv = getVolume(i);
        if (!isNaN(vol) || iv !== undefined) return iv === (isNaN(vol) ? undefined : vol);
        return true;
      }) || null
    );
  }, [formData.title, formData.volumeNumber, existingItems, initialData]);

  const searchCovers = async () => {
    const term = (formData.seriesName || formData.title).trim();
    if (!term) return;
    setIsSearching(true);
    setSearchFeedback(null);
    try {
      let results: CoverResult[] = [];
      if (formData.category === "manga") {
        const [aniList, mangaDex] = await Promise.all([
          searchAniList(term),
          searchMangaDex(term),
        ]);
        results = [...aniList, ...mangaDex];
      } else {
        results = await searchOpenLibrary(formData.title.trim() || term);
      }
      setCoverResults(results);
      if (results.length === 0) {
        setSearchFeedback(
          "Nessuna copertina trovata. Prova un titolo diverso o incolla un URL.",
        );
      }
    } catch (error) {
      console.error("Cover search failed:", error);
      setSearchFeedback("Ricerca non riuscita. Controlla la connessione.");
    } finally {
      setIsSearching(false);
    }
  };

  const fetchMetadata = async (isbn: string) => {
    const clean = isbn.replace(/[^0-9Xx]/g, "");
    if (!clean) return;
    setIsLookingUpIsbn(true);
    setSearchFeedback(null);
    try {
      const meta = await lookupIsbn(clean);
      if (meta) {
        setFormData((prev) => ({
          ...prev,
          isbn: clean,
          title: meta.title || prev.title,
          author: meta.author || prev.author,
          totalPages: meta.totalPages || prev.totalPages,
          coverUrl: meta.coverUrl || prev.coverUrl,
          description: meta.description || prev.description,
          genre:
            prev.genre ||
            (meta.genre && BOOK_GENRES.includes(meta.genre) ? meta.genre : ""),
        }));
        setSearchFeedback(null);
      } else {
        setFormData((prev) => ({ ...prev, isbn: clean }));
        setSearchFeedback(
          `Nessun risultato per l'ISBN ${clean}. Puoi compilare i campi a mano.`,
        );
      }
    } catch (error) {
      console.error("Metadata fetch failed:", error);
      setSearchFeedback("Ricerca ISBN non riuscita. Controlla la connessione.");
    } finally {
      setIsLookingUpIsbn(false);
    }
  };

  const addTag = (raw: string) => {
    const val = raw.trim();
    if (!val) return;
    if (!formData.tags.some((t) => t.toLowerCase() === val.toLowerCase())) {
      update({ tags: [...formData.tags, val] });
    }
    setTagDraft("");
  };

  const handleSave = () => {
    if (!formData.title.trim()) return;
    // Keep progress consistent: never more pages read than the book has.
    const total = Number(formData.totalPages) || 0;
    const read = Number(formData.pagesRead) || 0;
    const base = {
      ...formData,
      tags: tagDraft.trim()
        ? Array.from(new Set([...formData.tags, tagDraft.trim()]))
        : formData.tags,
      pagesRead: total > 0 && read > total ? total : formData.pagesRead,
    };
    if (isBulkMode && !isEditing) {
      const startVol = parseInt(formData.volumeNumber as string) || 1;
      const count = Math.min(300, Math.max(1, bulkCount));
      const itemsToSave = [];
      for (let i = 0; i < count; i++) {
        itemsToSave.push({
          ...base,
          seriesName: base.seriesName || base.title,
          volumeNumber: startVol + i,
          volumeCount: count,
          // Only the first volume gets the selected cover
          coverUrl: i === 0 ? base.coverUrl : "",
        });
      }
      onSave(itemsToSave);
    } else {
      onSave(base);
    }
    onClose();
  };

  if (!isOpen) return null;

  const categoryOptions: {
    id: Category;
    label: string;
    icon: typeof Book;
    active: string;
  }[] = [
    { id: "book", label: "Libro", icon: Book, active: "bg-amber-900/40 border-amber-600 text-amber-300" },
    { id: "manga", label: "Manga", icon: Sparkles, active: "bg-purple-900/40 border-purple-600 text-purple-300" },
    { id: "gdr", label: "GDR", icon: Sword, active: "bg-red-900/40 border-red-600 text-red-300" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-md overflow-hidden"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (
          (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ||
          isPlainEnterSubmit(e)
        ) {
          e.preventDefault();
          handleSave();
        }
      }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-modal-title"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-zinc-900 border-0 sm:border border-white/10 w-full h-full sm:h-auto sm:max-h-[92vh] sm:max-w-3xl rounded-none sm:rounded-[2rem] shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex justify-between items-center px-4 sm:px-8 pt-4 sm:pt-6 pb-3 border-b border-white/5">
          <div>
            <h2 id="item-modal-title" className="text-xl font-serif font-bold text-white">
              {isEditing
                ? "Modifica tesoro"
                : formData.isWishlist
                  ? "Nuovo desiderio"
                  : "Nuovo tesoro"}
            </h2>
            <p className="text-[10px] text-zinc-500 hidden sm:block">
              Invio o Ctrl+Invio per salvare · Esc per chiudere
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setShowScanner(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-all text-xs font-bold"
              title="Scansiona ISBN"
            >
              <Scan className="w-4 h-4" />
              <span className="hidden sm:inline">Scansiona</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Chiudi"
              className="p-2 text-zinc-500 hover:text-white rounded-xl hover:bg-white/5"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {showScanner && (
          <ISBNScanner
            onScan={fetchMetadata}
            onClose={() => setShowScanner(false)}
          />
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto no-scrollbar px-4 sm:px-8 py-5 space-y-5">
          {/* Category */}
          <div className="grid grid-cols-3 gap-2">
            {categoryOptions.map((cat) => {
              const CatIcon = cat.icon;
              return (
                <button
                  key={cat.id}
                  type="button"
                  aria-pressed={formData.category === cat.id}
                  onClick={() => update({ category: cat.id })}
                  className={cn(
                    "flex items-center justify-center gap-1.5 p-2.5 rounded-xl border transition-all text-[10px] font-bold uppercase tracking-widest",
                    formData.category === cat.id
                      ? cat.active
                      : "bg-white/5 border-white/10 text-zinc-500 hover:bg-white/10 hover:text-zinc-300",
                  )}
                >
                  <CatIcon className="w-3.5 h-3.5" />
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Cover + title/author */}
          <div className="flex flex-row gap-4 items-start">
            <div className="w-24 h-36 flex-shrink-0 bg-black/40 rounded-xl overflow-hidden border border-white/10 relative">
              <BookCover
                title={formData.title || "Senza titolo"}
                author={formData.author}
                category={formData.category}
                system={formData.system}
                volumeNumber={formData.volumeNumber || undefined}
                coverUrl={formData.coverUrl}
                size="md"
              />
              {formData.coverUrl && (
                <button
                  type="button"
                  onClick={() => update({ coverUrl: "" })}
                  className="absolute top-1 right-1 z-30 p-1 bg-black/70 rounded-full text-zinc-300 hover:text-white"
                  aria-label="Rimuovi copertina"
                  title="Rimuovi copertina"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="flex-1 min-w-0 space-y-3">
              <div className="space-y-1">
                <FieldLabel htmlFor="item-title">Titolo *</FieldLabel>
                <input
                  id="item-title"
                  autoFocus={!isEditing}
                  className={inputClass}
                  placeholder="Titolo..."
                  value={formData.title}
                  onChange={(e) => update({ title: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <FieldLabel htmlFor="item-author">
                  {formData.category === "gdr" ? "Editore / Autore" : "Autore"}
                </FieldLabel>
                <input
                  id="item-author"
                  className={inputClass}
                  placeholder="Autore..."
                  list="authors-list"
                  value={formData.author}
                  onChange={(e) => update({ author: e.target.value })}
                />
                <datalist id="authors-list">
                  {suggestions.authors.map((author) => (
                    <option key={author} value={author} />
                  ))}
                </datalist>
              </div>
              <button
                type="button"
                onClick={searchCovers}
                disabled={!formData.title.trim() || isSearching}
                className="text-[11px] font-bold text-blue-400 hover:text-blue-300 disabled:text-zinc-600 transition-colors flex items-center gap-1.5"
              >
                {isSearching ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )}
                <span>
                  {isSearching
                    ? "Cerco copertine..."
                    : formData.category === "manga"
                      ? "Cerca copertina su AniList / MangaDex"
                      : "Cerca copertina su Open Library"}
                </span>
              </button>
            </div>
          </div>

          {duplicate && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Hai già <strong>"{duplicate.title}"</strong>
                {getVolume(duplicate) !== undefined && ` (Vol. ${getVolume(duplicate)})`}
                {duplicate.isWishlist ? " nella wishlist." : " nella libreria."}
              </span>
            </div>
          )}

          {searchFeedback && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-white/5 border border-white/10 text-zinc-300 text-xs">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
              <span>{searchFeedback}</span>
            </div>
          )}

          {coverResults.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <FieldLabel>Scegli una copertina</FieldLabel>
                <button
                  type="button"
                  onClick={() => setCoverResults([])}
                  className="text-[10px] text-zinc-500 hover:text-white"
                >
                  Chiudi
                </button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                {coverResults.map((res, i) => (
                  <button
                    key={`${res.coverUrl}-${i}`}
                    type="button"
                    onClick={() => {
                      setFormData((prev) => ({
                        ...prev,
                        coverUrl: res.coverUrl,
                        author: prev.author || res.author || "",
                        description: prev.description || res.description || "",
                        totalPages: prev.totalPages || res.totalPages || "",
                      }));
                      setCoverResults([]);
                    }}
                    className="relative flex-shrink-0 w-20 h-28 rounded-lg overflow-hidden border-2 border-transparent hover:border-blue-500 focus-visible:border-blue-500 transition-all bg-black/40"
                    title={`${res.title}${res.author ? ` — ${res.author}` : ""}`}
                  >
                    <img
                      src={res.coverUrl}
                      className="w-full h-full object-cover"
                      alt={res.title}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-1">
                      <span className="block text-[7px] text-white font-bold truncate">
                        {res.source}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Series & volume */}
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-1">
              <FieldLabel htmlFor="item-series">Serie (opzionale)</FieldLabel>
              <input
                id="item-series"
                className={inputClass}
                placeholder="es. One Piece, Harry Potter..."
                list="series-list"
                value={formData.seriesName}
                onChange={(e) => update({ seriesName: e.target.value })}
              />
              <datalist id="series-list">
                {suggestions.series.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1 w-24">
              <FieldLabel htmlFor="item-volume">
                {isBulkMode ? "Dal vol." : "Volume #"}
              </FieldLabel>
              <input
                id="item-volume"
                type="number"
                min="1"
                inputMode="numeric"
                className={inputClass}
                placeholder="—"
                value={formData.volumeNumber}
                onChange={(e) =>
                  update({
                    volumeNumber:
                      e.target.value === "" ? "" : parseInt(e.target.value),
                  })
                }
              />
            </div>
          </div>

          {!isEditing && (
            <div className="rounded-2xl border border-white/10 bg-white/5">
              <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-2.5">
                  <Layers className="w-4 h-4 text-purple-400" />
                  <div>
                    <p className="text-xs font-bold text-white">Aggiunta multipla</p>
                    <p className="text-[10px] text-zinc-500">
                      Crea più volumi della stessa serie in un colpo
                    </p>
                  </div>
                </div>
                <ToggleSwitch
                  checked={isBulkMode}
                  onChange={setIsBulkMode}
                  activeClass="bg-purple-600"
                  label="Aggiunta multipla"
                />
              </div>
              {isBulkMode && (
                <div className="px-3 pb-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <FieldLabel htmlFor="bulk-count">Quanti volumi</FieldLabel>
                    <input
                      id="bulk-count"
                      type="number"
                      min="1"
                      max="300"
                      className={cn(inputClass, "w-24")}
                      value={bulkCount}
                      onChange={(e) =>
                        setBulkCount(
                          Math.min(300, Math.max(1, parseInt(e.target.value) || 1)),
                        )
                      }
                    />
                  </div>
                  <p className="text-[11px] text-purple-300">
                    Verranno creati i volumi da{" "}
                    <strong>{Number(formData.volumeNumber) || 1}</strong> a{" "}
                    <strong>
                      {(Number(formData.volumeNumber) || 1) + bulkCount - 1}
                    </strong>
                    {formData.seriesName || formData.title
                      ? ` della serie "${formData.seriesName || formData.title}".`
                      : "."}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Wishlist */}
          <div className="flex items-center justify-between p-3 bg-white/5 rounded-2xl border border-white/10">
            <div className="flex items-center space-x-3">
              <Heart
                className={cn(
                  "w-5 h-5",
                  formData.isWishlist ? "text-rose-500 fill-rose-500" : "text-zinc-500",
                )}
              />
              <div>
                <p className="text-xs font-bold text-white">Nella wishlist</p>
                <p className="text-[10px] text-zinc-500">
                  Non lo possiedi ancora, vuoi comprarlo
                </p>
              </div>
            </div>
            <ToggleSwitch
              checked={formData.isWishlist}
              onChange={(v) => update({ isWishlist: v })}
              activeClass="bg-rose-600"
              label="Nella wishlist"
            />
          </div>

          {/* Status */}
          <div className="space-y-2">
            <FieldLabel>Stato lettura</FieldLabel>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "unread", label: "Da leggere" },
                { id: "reading", label: "In lettura" },
                { id: "read", label: "Finito" },
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={formData.status === s.id}
                  onClick={() => {
                    const newStatus = s.id as Status;
                    const updates: any = { status: newStatus };
                    if (newStatus === "read" && formData.totalPages) {
                      updates.pagesRead = formData.totalPages;
                    }
                    update(updates);
                  }}
                  className={cn(
                    "py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest border transition-all",
                    formData.status === s.id
                      ? "bg-white text-zinc-900 border-white/30"
                      : "bg-white/5 border-white/10 text-zinc-500 hover:bg-white/10",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Pages */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <FieldLabel htmlFor="item-pages-read">Pagine lette</FieldLabel>
              <input
                id="item-pages-read"
                type="number"
                min="0"
                inputMode="numeric"
                className={inputClass}
                placeholder="0"
                value={formData.pagesRead}
                onChange={(e) => {
                  const v = e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value));
                  const patch: any = { pagesRead: v };
                  if (typeof v === "number" && v > 0 && formData.status === "unread") {
                    patch.status = "reading";
                  }
                  update(patch);
                }}
              />
            </div>
            <div className="space-y-1">
              <FieldLabel htmlFor="item-pages-total">Pagine totali</FieldLabel>
              <input
                id="item-pages-total"
                type="number"
                min="0"
                inputMode="numeric"
                className={inputClass}
                placeholder="0"
                value={formData.totalPages}
                onChange={(e) =>
                  update({
                    totalPages:
                      e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value)),
                  })
                }
              />
            </div>
          </div>

          {/* Category specific */}
          {formData.category === "book" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <FieldLabel>Genere</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  {BOOK_GENRES.map((g) => (
                    <button
                      key={g}
                      type="button"
                      aria-pressed={formData.genre === g}
                      onClick={() => update({ genre: formData.genre === g ? "" : g })}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                        formData.genre === g
                          ? "bg-white text-zinc-900 border-white/30"
                          : "bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10",
                      )}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {formData.category === "gdr" && (
            <div className="space-y-1">
              <FieldLabel htmlFor="item-system">Edizione / Sistema</FieldLabel>
              <input
                id="item-system"
                className={inputClass}
                placeholder="D&D 5e, Pathfinder 2e, Cyberpunk RED..."
                list="systems-list"
                value={formData.system}
                onChange={(e) => update({ system: e.target.value })}
              />
              <datalist id="systems-list">
                {suggestions.systems.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
          )}

          <div className="space-y-1">
            <FieldLabel htmlFor="item-isbn">ISBN</FieldLabel>
            <div className="flex gap-2">
              <input
                id="item-isbn"
                inputMode="numeric"
                className={cn(inputClass, "font-mono")}
                placeholder="978..."
                value={formData.isbn}
                data-enter-handled="true"
                onChange={(e) => update({ isbn: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    fetchMetadata(formData.isbn);
                  }
                }}
              />
              <button
                type="button"
                onClick={() => fetchMetadata(formData.isbn)}
                disabled={
                  isLookingUpIsbn ||
                  formData.isbn.replace(/[^0-9Xx]/g, "").length < 10
                }
                className="px-3 bg-white/10 hover:bg-white/15 disabled:opacity-40 text-white text-[10px] font-bold uppercase tracking-widest rounded-xl flex items-center gap-1.5 shrink-0"
                title="Compila automaticamente dai dati ISBN"
              >
                {isLookingUpIsbn ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )}
                <span>Compila</span>
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <FieldLabel htmlFor="item-description">Trama / Descrizione</FieldLabel>
            <textarea
              id="item-description"
              className={cn(inputClass, "p-3 min-h-[90px] resize-y")}
              placeholder="Trama o descrizione..."
              value={formData.description}
              onChange={(e) => update({ description: e.target.value })}
            />
          </div>

          {/* Advanced */}
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            aria-expanded={showMore}
            className="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-zinc-300 hover:bg-white/10 transition-colors"
          >
            <span>Prezzo, tag, voto, note e recensione</span>
            <ChevronRight
              className={cn("w-4 h-4 transition-transform", showMore && "rotate-90")}
            />
          </button>

          {showMore && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <FieldLabel htmlFor="item-price">Prezzo d'acquisto (€)</FieldLabel>
                  <input
                    id="item-price"
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    className={inputClass}
                    placeholder="0.00"
                    value={formData.price}
                    onChange={(e) =>
                      update({
                        price: e.target.value === "" ? "" : parseFloat(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <FieldLabel>Il mio voto</FieldLabel>
                  <div className="h-[42px] flex items-center">
                    <StarRating
                      rating={formData.rating}
                      setRating={(r) => update({ rating: r })}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <FieldLabel htmlFor="item-tags">Tag / Collezioni</FieldLabel>
                <input
                  id="item-tags"
                  className={inputClass}
                  placeholder="Scrivi e premi Invio o virgola..."
                  list="tags-list"
                  value={tagDraft}
                  data-enter-handled="true"
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v.endsWith(",")) addTag(v.slice(0, -1));
                    else setTagDraft(v);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag(tagDraft);
                    } else if (e.key === "Backspace" && !tagDraft && formData.tags.length) {
                      update({ tags: formData.tags.slice(0, -1) });
                    }
                  }}
                />
                <datalist id="tags-list">
                  {suggestions.tags
                    .filter((t) => !formData.tags.includes(t))
                    .map((t) => (
                      <option key={t} value={t} />
                    ))}
                </datalist>
                {formData.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {formData.tags.map((tag) => (
                      <span
                        key={tag}
                        className="bg-white/10 text-white text-xs pl-2 pr-1 py-1 rounded-md flex items-center gap-1"
                      >
                        {tag}
                        <button
                          type="button"
                          aria-label={`Rimuovi tag ${tag}`}
                          onClick={() =>
                            update({ tags: formData.tags.filter((t) => t !== tag) })
                          }
                          className="p-0.5 rounded hover:text-red-400 hover:bg-white/10"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="item-notes"
                  className="text-[9px] uppercase tracking-widest text-[var(--color-brand-orange)] font-bold flex items-center gap-1"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>Note personali</span>
                </label>
                <textarea
                  id="item-notes"
                  className={cn(inputClass, "p-3 min-h-[80px] resize-y focus:border-[var(--color-brand-orange)]")}
                  placeholder="Edizione, citazioni, segnalibri..."
                  value={formData.notes}
                  onChange={(e) => update({ notes: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <FieldLabel htmlFor="item-review">Diario di lettura / Recensione</FieldLabel>
                <textarea
                  id="item-review"
                  className={cn(inputClass, "p-3 min-h-[80px] resize-y")}
                  placeholder="Cosa ne pensi?"
                  value={formData.review}
                  onChange={(e) => update({ review: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <FieldLabel htmlFor="item-cover-url">URL copertina (manuale)</FieldLabel>
                <input
                  id="item-cover-url"
                  type="url"
                  className={inputClass}
                  placeholder="https://..."
                  value={formData.coverUrl}
                  onChange={(e) => update({ coverUrl: e.target.value })}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-8 py-4 border-t border-white/5 bg-zinc-900 flex gap-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-3.5 bg-white/5 hover:bg-white/10 text-zinc-300 font-bold rounded-2xl transition-all"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={!formData.title.trim()}
            onClick={handleSave}
            className="flex-1 py-3.5 bg-white text-zinc-900 font-bold rounded-2xl hover:bg-zinc-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isEditing
              ? "Salva modifiche"
              : isBulkMode
                ? `Aggiungi ${bulkCount} volumi`
                : formData.isWishlist
                  ? "Aggiungi alla wishlist"
                  : "Aggiungi alla collezione"}
          </button>
        </div>
      </motion.div>
    </div>
  );
};


const CATEGORY_LABELS: Record<Category, string> = {
  book: "Libri",
  manga: "Manga",
  gdr: "GDR",
};
const CATEGORY_COLORS: Record<string, string> = {
  Libri: "#d97706",
  Manga: "#9333ea",
  GDR: "#dc2626",
};
const chartTooltipProps = {
  contentStyle: {
    backgroundColor: "#18181b",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "12px",
    fontSize: "12px",
  },
  itemStyle: { color: "#f4f4f5" },
  labelStyle: { color: "#a1a1aa" },
};

const StatTile = ({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  accent: string;
}) => (
  <div className={cn("glass-card p-4 sm:p-5 rounded-3xl border-l-4", accent)}>
    <p className="text-[9px] uppercase font-bold text-zinc-500 tracking-widest mb-1">
      {label}
    </p>
    <p className="text-2xl sm:text-3xl font-serif font-bold text-white truncate">
      {value}
    </p>
    {hint && <p className="text-[10px] text-zinc-500 mt-1 truncate">{hint}</p>}
  </div>
);

const Dashboard = ({
  items,
  onOpenDetails,
}: {
  items: LibraryItem[];
  onOpenDetails: (item: LibraryItem) => void;
}) => {
  const [filter, setFilter] = useState<"all" | Category>("all");
  const [isChartMenuOpen, setIsChartMenuOpen] = useState(false);
  const [visibleCharts, setVisibleCharts] = useState({
    distribution: true,
    value: true,
  });

  const byCategory = (list: LibraryItem[]) =>
    filter === "all" ? list : list.filter((i) => i.category === filter);

  const filteredItems = useMemo(
    () => byCategory(items.filter((i) => !i.isWishlist)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, filter],
  );
  const wishlistItems = useMemo(
    () => byCategory(items.filter((i) => i.isWishlist)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, filter],
  );

  const stats = useMemo(() => {
    const total = filteredItems.length;
    const read = filteredItems.filter((i) => i.status === "read").length;
    const reading = filteredItems.filter((i) => i.status === "reading").length;
    const unread = filteredItems.filter((i) => i.status === "unread").length;
    const value = filteredItems.reduce((acc, curr) => acc + (Number(curr.price) || 0), 0);
    const priced = filteredItems.filter((i) => Number(i.price) > 0).length;
    const avgPrice = priced > 0 ? value / priced : 0;
    const totalPages = filteredItems.reduce((acc, curr) => acc + (Number(curr.totalPages) || 0), 0);
    const pagesRead = filteredItems.reduce(
      (acc, curr) =>
        acc + Math.min(Number(curr.pagesRead) || 0, Number(curr.totalPages) || Infinity),
      0,
    );
    const progressPercent = totalPages > 0 ? (pagesRead / totalPages) * 100 : 0;
    const loaned = filteredItems.filter((i) => i.loanedTo);
    const wishlistValue = wishlistItems.reduce((acc, curr) => acc + (Number(curr.price) || 0), 0);
    const rated = filteredItems.filter((i) => i.rating);
    const avgRating = rated.length
      ? rated.reduce((a, c) => a + (c.rating || 0), 0) / rated.length
      : 0;
    return {
      total,
      read,
      reading,
      unread,
      value,
      avgPrice,
      totalPages,
      pagesRead,
      progressPercent,
      loaned,
      wishlistValue,
      avgRating,
      readPercent: total ? Math.round((read / total) * 100) : 0,
    };
  }, [filteredItems, wishlistItems]);

  const genreData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredItems.forEach((item) => {
      const key = item.genre || (item.category === "gdr" ? item.system : "");
      if (key) counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [filteredItems]);

  const statusData = useMemo(
    () => [
      { name: "Da leggere", value: stats.unread, color: "#71717a" },
      { name: "In lettura", value: stats.reading, color: "#60a5fa" },
      { name: "Finiti", value: stats.read, color: "#22c55e" },
    ],
    [stats],
  );

  const categoryData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredItems.forEach((item) => {
      const label = CATEGORY_LABELS[item.category] || "Libri";
      counts[label] = (counts[label] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredItems]);

  const valueData = useMemo(() => {
    const values: Record<string, number> = {};
    filteredItems.forEach((item) => {
      const label = CATEGORY_LABELS[item.category] || "Libri";
      values[label] = (values[label] || 0) + (Number(item.price) || 0);
    });
    return Object.entries(values).map(([name, value]) => ({
      name,
      value: Math.round(value * 100) / 100,
    }));
  }, [filteredItems]);

  const currentlyReading = useMemo(
    () => filteredItems.filter((i) => i.status === "reading"),
    [filteredItems],
  );

  const hasData = filteredItems.length > 0;

  return (
    <div className="space-y-6 sm:space-y-8 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-serif font-bold text-white">Statistiche</h2>
          <p className="text-xs text-zinc-500 mt-1">
            La tua collezione in numeri (wishlist esclusa)
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 overflow-x-auto no-scrollbar flex-1 sm:flex-none">
            {[
              { id: "all", label: "Tutto" },
              { id: "book", label: "Libri" },
              { id: "manga", label: "Manga" },
              { id: "gdr", label: "GDR" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id as any)}
                aria-pressed={filter === f.id}
                className={cn(
                  "flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
                  filter === f.id ? "bg-white text-zinc-900" : "text-zinc-500 hover:text-white",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <button
              onClick={() => setIsChartMenuOpen((v) => !v)}
              aria-expanded={isChartMenuOpen}
              aria-label="Mostra/nascondi grafici"
              className={cn(
                "p-2 border rounded-xl transition-all",
                isChartMenuOpen
                  ? "bg-white/10 border-white/30 text-white"
                  : "bg-white/5 border-white/10 text-zinc-500 hover:text-white",
              )}
            >
              <Filter className="w-5 h-5" />
            </button>
            {isChartMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsChartMenuOpen(false)} />
                <div className="absolute right-0 mt-2 w-52 bg-zinc-900 border border-white/10 rounded-2xl p-4 shadow-2xl z-50">
                  <p className="text-[10px] uppercase font-bold text-zinc-500 mb-3 tracking-widest">
                    Grafici visibili
                  </p>
                  <label className="flex items-center space-x-3 cursor-pointer mb-2">
                    <input
                      type="checkbox"
                      checked={visibleCharts.distribution}
                      onChange={(e) =>
                        setVisibleCharts({ ...visibleCharts, distribution: e.target.checked })
                      }
                      className="accent-amber-600"
                    />
                    <span className="text-xs text-zinc-300">Distribuzione categorie</span>
                  </label>
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleCharts.value}
                      onChange={(e) =>
                        setVisibleCharts({ ...visibleCharts, value: e.target.checked })
                      }
                      className="accent-amber-600"
                    />
                    <span className="text-xs text-zinc-300">Valore economico</span>
                  </label>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatTile
          label="Volumi"
          value={stats.total}
          hint={`${stats.reading} in lettura · ${stats.unread} da leggere`}
          accent="border-amber-600"
        />
        <StatTile
          label="Finiti"
          value={stats.read}
          hint={`${stats.readPercent}% della collezione`}
          accent="border-green-600"
        />
        <StatTile
          label="Valore"
          value={formatPrice(stats.value)}
          hint={stats.avgPrice ? `Media ${formatPrice(stats.avgPrice)}` : "Aggiungi i prezzi"}
          accent="border-blue-600"
        />
        <StatTile
          label="Wishlist"
          value={wishlistItems.length}
          hint={stats.wishlistValue ? `Budget ${formatPrice(stats.wishlistValue)}` : "desideri"}
          accent="border-rose-600"
        />
      </div>

      {/* Reading progress */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="glass-card p-6 rounded-3xl space-y-4">
          <div className="flex justify-between items-end gap-4">
            <div className="min-w-0">
              <p className="text-[9px] uppercase font-bold text-zinc-500 tracking-widest mb-1">
                Pagine lette
              </p>
              <p className="text-2xl font-serif font-bold text-white">
                {stats.pagesRead.toLocaleString()}{" "}
                <span className="text-sm text-zinc-500 font-sans">
                  / {stats.totalPages.toLocaleString()}
                </span>
              </p>
            </div>
            <p className="text-2xl font-mono font-bold text-white">
              {Math.round(stats.progressPercent)}%
            </p>
          </div>
          <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${stats.progressPercent}%` }}
              className="h-full bg-gradient-to-r from-amber-600 to-orange-400"
            />
          </div>
        </div>
        <div className="glass-card p-6 rounded-3xl flex items-center justify-between">
          <div>
            <p className="text-[9px] uppercase font-bold text-zinc-500 tracking-widest mb-1">
              Voto medio
            </p>
            <div className="flex items-center gap-3">
              <p className="text-4xl font-serif font-bold text-white">
                {stats.avgRating ? stats.avgRating.toFixed(1) : "—"}
              </p>
              {stats.avgRating > 0 && (
                <StarRating rating={Math.round(stats.avgRating)} readonly />
              )}
            </div>
          </div>
          <div className="p-4 bg-amber-900/20 rounded-2xl">
            <Sparkles className="w-8 h-8 text-amber-400" />
          </div>
        </div>
      </div>

      {!hasData ? (
        <div className="glass-card p-10 rounded-3xl text-center text-zinc-500 text-sm">
          Nessun elemento in questa categoria: aggiungine qualcuno per vedere i grafici.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleCharts.distribution && (
            <div className="glass-card p-6 rounded-3xl h-[320px] flex flex-col">
              <h3 className="text-[10px] font-bold text-zinc-500 mb-4 uppercase tracking-widest">
                Distribuzione categorie
              </h3>
              <div className="flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="45%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                      stroke="none"
                    >
                      {categoryData.map((entry) => (
                        <Cell
                          key={`cell-category-${entry.name}`}
                          fill={CATEGORY_COLORS[entry.name] || "#71717a"}
                        />
                      ))}
                    </Pie>
                    <Tooltip {...chartTooltipProps} />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="glass-card p-6 rounded-3xl h-[320px] flex flex-col">
            <h3 className="text-[10px] font-bold text-zinc-500 mb-4 uppercase tracking-widest">
              Stato di lettura
            </h3>
            <div className="flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusData} layout="vertical">
                  <XAxis type="number" hide allowDecimals={false} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    stroke="#71717a"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    width={74}
                  />
                  <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} {...chartTooltipProps} />
                  <Bar dataKey="value" name="Volumi" radius={[0, 4, 4, 0]}>
                    {statusData.map((entry) => (
                      <Cell key={`cell-status-${entry.name}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {visibleCharts.value && (
            <div className="glass-card p-6 rounded-3xl h-[320px] flex flex-col">
              <h3 className="text-[10px] font-bold text-zinc-500 mb-4 uppercase tracking-widest">
                Valore per categoria
              </h3>
              <div className="flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={valueData}>
                    <XAxis dataKey="name" stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} width={40} />
                    <Tooltip
                      cursor={{ fill: "rgba(255,255,255,0.04)" }}
                      formatter={(v: any) => [formatPrice(v), "Valore"]}
                      {...chartTooltipProps}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {valueData.map((entry) => (
                        <Cell key={`cell-value-${entry.name}`} fill={CATEGORY_COLORS[entry.name] || "#3b82f6"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {genreData.length > 0 && (
            <div className="glass-card p-6 rounded-3xl h-[320px] flex flex-col lg:col-span-2">
              <h3 className="text-[10px] font-bold text-zinc-500 mb-4 uppercase tracking-widest">
                Generi / sistemi preferiti
              </h3>
              <div className="flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={genreData}>
                    <XAxis dataKey="name" stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} width={30} />
                    <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} {...chartTooltipProps} />
                    <Bar dataKey="value" name="Volumi" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="glass-card p-6 rounded-3xl h-[320px] flex flex-col overflow-hidden">
            <h3 className="text-[10px] font-bold text-zinc-500 mb-4 uppercase tracking-widest">
              Sul comodino ({currentlyReading.length})
            </h3>
            <div className="flex-1 overflow-y-auto no-scrollbar space-y-2">
              {currentlyReading.length > 0 ? (
                currentlyReading.map((item) => {
                  const pct = item.totalPages
                    ? Math.min(100, ((Number(item.pagesRead) || 0) / Number(item.totalPages)) * 100)
                    : 0;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onOpenDetails(item)}
                      className="w-full text-left flex items-center space-x-3 p-2 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-colors"
                    >
                      <div className="w-10 h-14 bg-zinc-800 rounded-lg overflow-hidden flex-shrink-0 border border-white/10 shadow-sm relative">
                        <BookCover
                          title={item.title}
                          author={item.author}
                          category={item.category}
                          coverUrl={item.coverUrl}
                          size="sm"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-white truncate">{item.title}</p>
                        <p className="text-[10px] text-zinc-500 truncate">
                          {item.author}
                          {item.totalPages ? ` · ${Math.round(pct)}%` : ""}
                        </p>
                        <div className="mt-1 w-full bg-white/10 h-1 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <p className="text-xs text-zinc-500 text-center py-10 italic">
                  Niente sul comodino al momento.
                </p>
              )}
            </div>
          </div>

          <div className="glass-card p-6 rounded-3xl h-[320px] flex flex-col overflow-hidden">
            <h3 className="text-[10px] font-bold text-zinc-500 mb-4 uppercase tracking-widest flex items-center gap-1.5">
              <Handshake className="w-3.5 h-3.5" /> In prestito ({stats.loaned.length})
            </h3>
            <div className="flex-1 overflow-y-auto no-scrollbar space-y-2">
              {stats.loaned.length > 0 ? (
                [...stats.loaned]
                  .sort((a, b) => (daysSince(b.loanDate) ?? 0) - (daysSince(a.loanDate) ?? 0))
                  .map((item) => {
                    const days = daysSince(item.loanDate);
                    const overdue = days !== null && days > 30;
                    return (
                      <button
                        key={item.id}
                        onClick={() => onOpenDetails(item)}
                        className="w-full text-left flex items-center justify-between gap-3 p-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">{item.title}</p>
                          <p className="text-[10px] text-amber-400 truncate">{item.loanedTo}</p>
                        </div>
                        {days !== null && (
                          <span
                            className={cn(
                              "text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0",
                              overdue ? "bg-red-500/15 text-red-300" : "bg-white/10 text-zinc-400",
                            )}
                          >
                            {days === 0 ? "oggi" : `${days} gg`}
                          </span>
                        )}
                      </button>
                    );
                  })
              ) : (
                <p className="text-xs text-zinc-500 text-center py-10 italic">
                  Tutti i tuoi tesori sono a casa.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


const DetailsModal = ({
  item,
  allItems,
  onClose,
  onPatch,
  onUpdateLoan,
  onEdit,
  onDelete,
  onMarkAsBought,
  onNavigate,
}: {
  item: LibraryItem | null;
  allItems: LibraryItem[];
  onClose: () => void;
  onPatch: (id: string, patch: Partial<LibraryItem>) => void;
  onUpdateLoan: (id: string, loanedTo: string, loanDate: Date | null) => void;
  onEdit: (item: LibraryItem) => void;
  onDelete: (id: string) => void;
  onMarkAsBought?: (item: LibraryItem) => void;
  onNavigate: (item: LibraryItem) => void;
}) => {
  const isOpen = Boolean(item);
  const [pagesDraft, setPagesDraft] = useState<number>(0);
  const [loanDraft, setLoanDraft] = useState("");
  const [showFullDescription, setShowFullDescription] = useState(false);

  useEscapeKey(isOpen, onClose);
  useBodyScrollLock(isOpen);

  useEffect(() => {
    setPagesDraft(item?.pagesRead || 0);
  }, [item?.id, item?.pagesRead]);

  useEffect(() => {
    setLoanDraft("");
    setShowFullDescription(false);
  }, [item?.id]);

  const seriesNav = useMemo(() => {
    if (!item?.seriesName) return null;
    const siblings = allItems
      .filter((i) => i.seriesName === item.seriesName && !!i.isWishlist === !!item.isWishlist)
      .sort((a, b) => (getVolume(a) ?? 0) - (getVolume(b) ?? 0));
    const idx = siblings.findIndex((i) => i.id === item.id);
    if (idx === -1 || siblings.length < 2) return null;
    return {
      prev: siblings[idx - 1],
      next: siblings[idx + 1],
      position: idx + 1,
      total: siblings.length,
    };
  }, [allItems, item]);

  if (!item) return null;

  const categoryConfig = {
    book: { icon: Book, color: "text-amber-500", label: "Libro" },
    manga: { icon: Sparkles, color: "text-purple-400", label: "Manga" },
    gdr: { icon: Sword, color: "text-red-400", label: "GDR" },
  };
  const statusConfig: Record<Status, { label: string }> = {
    unread: { label: "Da leggere" },
    reading: { label: "In lettura" },
    read: { label: "Finito" },
  };

  const config = categoryConfig[item.category] || categoryConfig.book;
  const CatIcon = config.icon;
  const volume = getVolume(item);
  const totalPages = Number(item.totalPages) || 0;
  const progress = totalPages ? Math.min(100, (pagesDraft / totalPages) * 100) : 0;
  const loanDays = daysSince(item.loanDate);

  const commitPages = (value: number) => {
    const clamped = Math.max(0, totalPages ? Math.min(totalPages, value) : value);
    setPagesDraft(clamped);
    if (clamped === (item.pagesRead || 0)) return;
    const patch: Partial<LibraryItem> = { pagesRead: clamped };
    if (clamped > 0 && item.status === "unread") patch.status = "reading";
    if (totalPages && clamped >= totalPages) patch.status = "read";
    onPatch(item.id, patch);
  };

  const setStatus = (s: Status) => {
    if (s === item.status) return;
    const patch: Partial<LibraryItem> = { status: s };
    if (s === "read" && totalPages) patch.pagesRead = totalPages;
    if (s === "unread") patch.pagesRead = 0;
    onPatch(item.id, patch);
  };

  const submitLoan = () => {
    const name = loanDraft.trim();
    if (!name) return;
    onUpdateLoan(item.id, name, new Date());
    setLoanDraft("");
  };

  const longDescription = (item.description || "").length > 320;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-md overflow-hidden"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        key={item.id}
        role="dialog"
        aria-modal="true"
        aria-labelledby="details-title"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-zinc-900 border-0 sm:border border-white/10 w-full h-full sm:h-auto sm:max-h-[92vh] sm:max-w-3xl rounded-none sm:rounded-[2rem] shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-8 pt-4 sm:pt-6 pb-3 border-b border-white/5">
          <div className="flex items-center gap-2 min-w-0">
            <span className={cn("flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold", config.color)}>
              <CatIcon className="w-3.5 h-3.5" />
              {config.label}
            </span>
            {seriesNav && (
              <span className="text-[10px] text-zinc-500 truncate">
                · {item.seriesName} ({seriesNav.position}/{seriesNav.total})
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {seriesNav && (
              <>
                <button
                  onClick={() => seriesNav.prev && onNavigate(seriesNav.prev)}
                  disabled={!seriesNav.prev}
                  className="p-2 text-zinc-400 hover:text-white disabled:opacity-25 rounded-xl hover:bg-white/5"
                  aria-label="Volume precedente"
                  title="Volume precedente"
                >
                  <ChevronRight className="w-5 h-5 rotate-180" />
                </button>
                <button
                  onClick={() => seriesNav.next && onNavigate(seriesNav.next)}
                  disabled={!seriesNav.next}
                  className="p-2 text-zinc-400 hover:text-white disabled:opacity-25 rounded-xl hover:bg-white/5"
                  aria-label="Volume successivo"
                  title="Volume successivo"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}
            <button
              onClick={onClose}
              aria-label="Chiudi"
              className="p-2 text-zinc-500 hover:text-white rounded-xl hover:bg-white/5"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto no-scrollbar px-4 sm:px-8 py-5 space-y-5">
          <div className="flex gap-4 sm:gap-6">
            <div className="w-28 h-40 sm:w-36 sm:h-52 flex-shrink-0 bg-black/40 rounded-xl overflow-hidden border border-white/10 shadow-2xl relative">
              <BookCover
                title={item.title}
                author={item.author}
                category={item.category}
                system={item.system}
                volumeNumber={volume}
                coverUrl={item.coverUrl}
              />
            </div>
            <div className="flex-1 min-w-0 space-y-3">
              <div>
                <h2 id="details-title" className="text-xl sm:text-2xl font-serif font-bold text-white leading-tight break-words">
                  {item.title}
                  {volume !== undefined && (
                    <span className="text-zinc-500 font-sans text-base font-medium"> · Vol. {volume}</span>
                  )}
                </h2>
                {item.author && <p className="text-sm text-zinc-400 mt-1">{item.author}</p>}
              </div>

              <div className="flex items-center gap-2">
                <StarRating
                  rating={item.rating || 0}
                  setRating={(r) => onPatch(item.id, { rating: r })}
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {(["unread", "reading", "read"] as Status[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    aria-pressed={item.status === s}
                    className={cn(
                      "px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border transition-all",
                      item.status === s
                        ? s === "read"
                          ? "bg-emerald-500 text-white border-emerald-400"
                          : s === "reading"
                            ? "bg-blue-500 text-white border-blue-400"
                            : "bg-white text-zinc-900 border-white/30"
                        : "bg-white/5 text-zinc-500 border-white/10 hover:bg-white/10 hover:text-zinc-300",
                    )}
                  >
                    {statusConfig[s].label}
                  </button>
                ))}
              </div>

              {item.tags && item.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {item.tags.map((tag) => (
                    <span
                      key={tag}
                      className="bg-white/5 border border-white/10 text-zinc-300 text-[10px] px-2 py-0.5 rounded-full"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {item.isWishlist && (
            <div className="p-3.5 sm:p-4 bg-gradient-to-r from-rose-500/10 via-amber-500/10 to-emerald-500/10 border border-rose-500/20 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-rose-500/20 text-rose-400 rounded-xl shrink-0">
                  <Heart className="w-5 h-5 fill-rose-500/30" />
                </div>
                <div>
                  <p className="text-xs font-bold text-white">Nella tua wishlist</p>
                  <p className="text-[11px] text-zinc-400">
                    Non fa ancora parte della tua libreria fisica
                    {item.price ? ` · ${formatPrice(item.price)}` : ""}.
                  </p>
                </div>
              </div>
              {onMarkAsBought && (
                <button
                  onClick={() => onMarkAsBought(item)}
                  className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center gap-1.5 transition-all active:scale-95 shrink-0"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>Segna come comprato</span>
                </button>
              )}
            </div>
          )}

          {/* Progress */}
          <div className="p-5 rounded-2xl space-y-3 bg-white/[0.03] border border-white/10">
            <div className="flex justify-between items-center">
              <label htmlFor={`pages-${item.id}`} className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
                Progresso lettura
              </label>
              <p className="text-xs font-mono text-zinc-500">
                <span className="text-white font-bold">{pagesDraft}</span> / {totalPages || "?"}
                {totalPages > 0 && <span className="ml-1 text-[10px] opacity-60">({Math.round(progress)}%)</span>}
              </p>
            </div>

            {totalPages > 0 ? (
              <>
                <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden border border-white/5">
                  <div
                    className={cn(
                      "h-full transition-all duration-300 ease-out",
                      item.category === "manga"
                        ? "bg-purple-600"
                        : item.category === "gdr"
                          ? "bg-red-600"
                          : "bg-amber-600",
                    )}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => commitPages(pagesDraft - 10)}
                    className="w-10 h-9 flex items-center justify-center bg-white/5 rounded-lg text-xs text-white hover:bg-white/10 active:scale-90 transition-all shrink-0"
                    aria-label="Meno 10 pagine"
                  >
                    -10
                  </button>
                  <input
                    id={`pages-${item.id}`}
                    type="range"
                    min="0"
                    max={totalPages}
                    value={pagesDraft}
                    onChange={(e) => setPagesDraft(parseInt(e.target.value))}
                    onPointerUp={(e) => commitPages(parseInt((e.target as HTMLInputElement).value))}
                    onKeyUp={(e) => commitPages(parseInt((e.target as HTMLInputElement).value))}
                    onBlur={(e) => commitPages(parseInt(e.target.value))}
                    className="flex-1 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-white"
                  />
                  <button
                    onClick={() => commitPages(pagesDraft + 10)}
                    className="w-10 h-9 flex items-center justify-center bg-white/5 rounded-lg text-xs text-white hover:bg-white/10 active:scale-90 transition-all shrink-0"
                    aria-label="Più 10 pagine"
                  >
                    +10
                  </button>
                  <input
                    type="number"
                    min="0"
                    max={totalPages}
                    inputMode="numeric"
                    aria-label="Pagina corrente"
                    value={pagesDraft}
                    onChange={(e) => setPagesDraft(Math.max(0, parseInt(e.target.value) || 0))}
                    onBlur={(e) => commitPages(parseInt(e.target.value) || 0)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitPages(parseInt((e.target as HTMLInputElement).value) || 0);
                    }}
                    className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-base sm:text-xs text-white text-center font-mono focus:outline-none focus:border-white/30"
                  />
                </div>
              </>
            ) : (
              <button
                onClick={() => onEdit(item)}
                className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
              >
                Imposta il numero di pagine per tracciare i progressi →
              </button>
            )}
          </div>

          {item.notes && (
            <div className="p-5 rounded-2xl space-y-2 bg-amber-500/5 border border-amber-500/20">
              <div className="flex items-center space-x-2 text-[var(--color-brand-orange)]">
                <Edit3 className="w-4 h-4" />
                <span className="text-[10px] uppercase tracking-widest font-bold">Note</span>
              </div>
              <p className="text-zinc-200 text-sm leading-relaxed whitespace-pre-line">{item.notes}</p>
            </div>
          )}

          {item.description && (
            <div className="p-5 rounded-2xl space-y-2 bg-white/[0.03] border border-white/10">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Trama</span>
              <p
                className={cn(
                  "text-zinc-300 text-sm leading-relaxed whitespace-pre-line",
                  longDescription && !showFullDescription && "line-clamp-5",
                )}
              >
                {item.description}
              </p>
              {longDescription && (
                <button
                  onClick={() => setShowFullDescription((v) => !v)}
                  className="text-xs font-semibold text-blue-400 hover:text-blue-300"
                >
                  {showFullDescription ? "Mostra meno" : "Leggi tutto"}
                </button>
              )}
            </div>
          )}

          {item.review && (
            <div className="p-5 rounded-2xl space-y-2 bg-purple-900/10 border border-purple-500/20">
              <span className="text-[10px] uppercase tracking-widest text-purple-400 font-bold">
                Diario di lettura
              </span>
              <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-line italic">
                "{item.review}"
              </p>
            </div>
          )}

          {!item.notes && !item.description && !item.review && (
            <button
              onClick={() => onEdit(item)}
              className="w-full p-4 rounded-2xl border border-dashed border-white/10 flex items-center justify-between text-zinc-500 hover:border-white/20 hover:text-zinc-300 transition-colors"
            >
              <span className="text-xs">Nessuna nota o trama per questo elemento</span>
              <span className="text-xs text-[var(--color-brand-purple)] font-bold flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Aggiungi
              </span>
            </button>
          )}

          {/* Info grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: "Genere", value: item.genre },
              { label: "Sistema", value: item.system },
              { label: "Serie", value: item.seriesName },
              { label: "Volume", value: volume !== undefined ? String(volume) : item.totalVolumes },
              { label: "ISBN", value: item.isbn, mono: true },
              { label: "Prezzo", value: item.price !== undefined && item.price !== null ? formatPrice(item.price) : undefined, mono: true },
              { label: "Aggiunto il", value: formatDate(item.createdAt) || undefined },
            ]
              .filter((f) => f.value)
              .map((f) => (
                <div key={f.label} className="bg-white/5 p-3 rounded-xl border border-white/10 min-w-0">
                  <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold block mb-0.5">
                    {f.label}
                  </span>
                  <p className={cn("text-white text-xs truncate", f.mono && "font-mono")} title={f.value}>
                    {f.value}
                  </p>
                </div>
              ))}
          </div>

          {/* Loan */}
          {!item.isWishlist && (
            <div className="p-5 rounded-2xl space-y-4 bg-white/[0.03] border border-white/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Handshake className={cn("w-5 h-5", item.loanedTo ? "text-amber-500" : "text-zinc-500")} />
                  <div>
                    <p className="text-xs font-bold text-white">Registro prestiti</p>
                    <p className="text-[10px] text-zinc-500">Tieni traccia di chi l'ha preso in prestito</p>
                  </div>
                </div>
                {item.loanedTo && (
                  <button
                    onClick={() => onUpdateLoan(item.id, "", null)}
                    className="px-3 py-1.5 text-[10px] font-bold text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg uppercase tracking-widest"
                  >
                    Restituito
                  </button>
                )}
              </div>

              {item.loanedTo ? (
                <div className="p-3 bg-amber-900/10 border border-amber-900/30 rounded-xl flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-white">
                      Prestato a <span className="font-bold text-amber-400">{item.loanedTo}</span>
                    </p>
                    <p className="text-[10px] text-zinc-500">dal {formatDate(item.loanDate)}</p>
                  </div>
                  {loanDays !== null && (
                    <span
                      className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded-full",
                        loanDays > 30 ? "bg-red-500/15 text-red-300" : "bg-white/10 text-zinc-400",
                      )}
                    >
                      {loanDays === 0 ? "oggi" : `${loanDays} giorni`}
                    </span>
                  )}
                </div>
              ) : (
                <form
                  className="flex space-x-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitLoan();
                  }}
                >
                  <input
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl p-2.5 text-base sm:text-xs text-white focus:outline-none focus:border-white/30 placeholder:text-zinc-500"
                    placeholder="Nome dell'amico..."
                    aria-label="Nome di chi prende in prestito"
                    value={loanDraft}
                    onChange={(e) => setLoanDraft(e.target.value)}
                  />
                  <button
                    type="submit"
                    disabled={!loanDraft.trim()}
                    className="px-4 bg-white text-zinc-900 text-[10px] font-bold uppercase tracking-widest rounded-xl hover:bg-zinc-200 disabled:opacity-40"
                  >
                    Presta
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-8 py-4 border-t border-white/5 bg-zinc-900 flex items-center justify-between gap-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            onClick={() => onDelete(item.id)}
            className="px-3.5 py-2.5 text-zinc-400 hover:text-red-400 text-xs font-semibold rounded-xl flex items-center gap-1.5 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            <span>Elimina</span>
          </button>
          <button
            onClick={() => onEdit(item)}
            className="py-2.5 px-5 bg-white text-zinc-900 font-bold text-xs rounded-xl hover:bg-zinc-200 flex items-center justify-center gap-2 shadow-lg transition-all"
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>Modifica</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
};


const DeleteConfirmationModal = ({
  isOpen,
  onConfirm,
  onCancel,
  title,
  count = 1,
}: {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  count?: number;
}) => {
  useEscapeKey(isOpen, onCancel);
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <motion.div
        role="alertdialog"
        aria-modal="true"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-zinc-900 border border-white/10 p-6 rounded-3xl max-w-sm w-full space-y-6 shadow-2xl"
      >
        <div className="space-y-3 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <Trash2 className="w-5 h-5 text-red-400" />
          </div>
          <h3 className="text-xl font-bold text-white">
            {count > 1 ? `Eliminare ${count} elementi?` : "Eliminare questo elemento?"}
          </h3>
          <p className="text-zinc-400 text-sm">
            {title && count === 1 ? (
              <>
                <strong className="text-zinc-200">"{title}"</strong> verrà rimosso
                definitivamente dalla tua libreria.
              </>
            ) : (
              "L'azione è irreversibile."
            )}
          </p>
        </div>
        <div className="flex space-x-3">
          <button
            autoFocus
            onClick={onCancel}
            className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white font-bold rounded-2xl transition-all"
          >
            Annulla
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-red-900/20"
          >
            Sì, elimina
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const BulkToolbar = ({
  count,
  visibleCount,
  totalPrice,
  onEdit,
  onDelete,
  onClear,
  onSelectAll,
  onMarkAsBought,
  isWishlist,
}: {
  count: number;
  visibleCount: number;
  totalPrice: number;
  onEdit: () => void;
  onDelete: () => void;
  onClear: () => void;
  onSelectAll: () => void;
  onMarkAsBought?: () => void;
  isWishlist?: boolean;
}) => {
  const allSelected = count > 0 && count >= visibleCount;
  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      className="fixed bottom-24 sm:bottom-8 left-1/2 -translate-x-1/2 z-50 bg-zinc-900/95 border border-white/10 rounded-2xl p-2 flex items-center gap-1.5 sm:gap-2 shadow-2xl backdrop-blur-xl max-w-[calc(100vw-1.5rem)]"
    >
      <div className="px-3 py-1.5 bg-white/5 rounded-xl border border-white/10 flex flex-col items-center min-w-[84px]">
        <span className="text-xs font-bold text-white whitespace-nowrap">
          {count} selezionati
        </span>
        {totalPrice > 0 && (
          <span className="text-[9px] text-zinc-500 font-mono">{formatPrice(totalPrice)}</span>
        )}
      </div>
      <button
        onClick={onSelectAll}
        className="p-2.5 sm:px-3 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white rounded-xl transition-all flex items-center gap-1.5 text-xs font-bold"
        title={allSelected ? "Deseleziona tutti" : "Seleziona tutti i visibili"}
      >
        <ListChecks className="w-4 h-4" />
        <span className="hidden sm:inline">{allSelected ? "Nessuno" : "Tutti"}</span>
      </button>
      {isWishlist && onMarkAsBought && (
        <button
          onClick={onMarkAsBought}
          disabled={count === 0}
          className="p-2.5 sm:px-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95"
          title="Segna selezionati come comprati"
        >
          <ShoppingBag className="w-4 h-4" />
          <span className="hidden sm:inline">Comprati</span>
        </button>
      )}
      <button
        onClick={onEdit}
        disabled={count === 0}
        className="p-2.5 bg-white/5 hover:bg-white/10 disabled:opacity-40 text-white rounded-xl transition-all"
        title="Modifica selezionati"
        aria-label="Modifica selezionati"
      >
        <Edit3 className="w-4 h-4" />
      </button>
      <button
        onClick={onDelete}
        disabled={count === 0}
        className="p-2.5 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40 text-red-400 rounded-xl transition-all"
        title="Elimina selezionati"
        aria-label="Elimina selezionati"
      >
        <Trash2 className="w-4 h-4" />
      </button>
      <div className="w-px h-8 bg-white/10" />
      <button
        onClick={onClear}
        className="p-2.5 text-zinc-500 hover:text-white transition-all"
        title="Esci dalla selezione"
        aria-label="Esci dalla selezione"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
};

const BulkEditModal = ({
  isOpen,
  count,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  count: number;
  onClose: () => void;
  onSave: (updates: any, addTag?: string) => void;
}) => {
  const [seriesName, setSeriesName] = useState("");
  const [author, setAuthor] = useState("");
  const [status, setStatus] = useState<Status | "">("");
  const [category, setCategory] = useState<Category | "">("");
  const [tag, setTag] = useState("");
  const [price, setPrice] = useState<number | "">("");

  useEscapeKey(isOpen, onClose);
  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    setSeriesName("");
    setAuthor("");
    setStatus("");
    setCategory("");
    setTag("");
    setPrice("");
  }, [isOpen]);

  const updates: any = {};
  if (seriesName.trim()) updates.seriesName = seriesName.trim();
  if (author.trim()) updates.author = author.trim();
  if (status) updates.status = status;
  if (category) updates.category = category;
  if (price !== "" && !isNaN(price)) updates.price = price;
  const hasChanges = Object.keys(updates).length > 0 || tag.trim().length > 0;

  const handleApply = () => {
    if (!hasChanges) return;
    onSave(updates, tag.trim() || undefined);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-md overflow-hidden"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (isPlainEnterSubmit(e)) {
          e.preventDefault();
          handleApply();
        }
      }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-zinc-900 border-0 sm:border border-white/10 w-full h-full sm:h-auto sm:max-h-[92vh] sm:max-w-xl rounded-none sm:rounded-[2rem] p-4 sm:p-8 space-y-5 overflow-y-auto no-scrollbar shadow-2xl flex flex-col"
      >
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-serif font-bold text-white">Modifica multipla</h2>
            <p className="text-xs text-zinc-500 mt-1">
              Applica a {count} {count === 1 ? "elemento" : "elementi"}. I campi vuoti restano invariati.
            </p>
          </div>
          <button onClick={onClose} aria-label="Chiudi" className="p-2 text-zinc-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <FieldLabel htmlFor="bulk-series">Serie</FieldLabel>
              <input
                id="bulk-series"
                className={inputClass}
                placeholder="Nome serie..."
                value={seriesName}
                onChange={(e) => setSeriesName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <FieldLabel htmlFor="bulk-author">Autore</FieldLabel>
              <input
                id="bulk-author"
                className={inputClass}
                placeholder="Autore..."
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <FieldLabel>Categoria</FieldLabel>
            <div className="grid grid-cols-3 gap-2">
              {(["book", "manga", "gdr"] as Category[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={category === c}
                  onClick={() => setCategory(category === c ? "" : c)}
                  className={cn(
                    "p-2.5 rounded-xl border transition-all text-[10px] font-bold uppercase tracking-widest",
                    category === c
                      ? "bg-white text-zinc-900 border-white/30"
                      : "bg-white/5 border-white/10 text-zinc-500 hover:bg-white/10",
                  )}
                >
                  {CATEGORY_LABELS[c]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <FieldLabel>Stato</FieldLabel>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: "unread", label: "Da leggere" },
                  { id: "reading", label: "In lettura" },
                  { id: "read", label: "Finito" },
                ] as { id: Status; label: string }[]
              ).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={status === s.id}
                  onClick={() => setStatus(status === s.id ? "" : s.id)}
                  className={cn(
                    "p-2.5 rounded-xl border transition-all text-[10px] font-bold uppercase tracking-widest",
                    status === s.id
                      ? "bg-white text-zinc-900 border-white/30"
                      : "bg-white/5 border-white/10 text-zinc-500 hover:bg-white/10",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <FieldLabel htmlFor="bulk-tag">Aggiungi tag</FieldLabel>
              <input
                id="bulk-tag"
                className={inputClass}
                placeholder="es. Da regalare"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <FieldLabel htmlFor="bulk-price">Prezzo (€) per elemento</FieldLabel>
              <input
                id="bulk-price"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                className={inputClass}
                placeholder="0.00"
                value={price}
                onChange={(e) => setPrice(e.target.value === "" ? "" : parseFloat(e.target.value))}
              />
            </div>
          </div>
        </div>

        <button
          onClick={handleApply}
          disabled={!hasChanges}
          className="w-full py-4 bg-white text-zinc-900 font-bold rounded-2xl hover:bg-zinc-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Applica a {count} {count === 1 ? "elemento" : "elementi"}
        </button>
      </motion.div>
    </div>
  );
};

const AlertConfirmModal = ({
  isOpen,
  title,
  message,
  onConfirm,
  onClose,
  showCancel = false,
}: {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm?: () => void;
  onClose: () => void;
  showCancel?: boolean;
}) => {
  useEscapeKey(isOpen, onClose);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <motion.div
        role="alertdialog"
        aria-modal="true"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-zinc-900 border border-white/10 w-full max-w-sm rounded-[2rem] p-8 space-y-6 shadow-2xl text-center"
      >
        <div className="space-y-3">
          <h2 className="text-xl font-serif font-bold text-white">{title}</h2>
          <p className="text-zinc-400 text-sm leading-relaxed whitespace-pre-line">{message}</p>
        </div>

        <div className="flex gap-3 pt-2">
          {showCancel && (
            <button
              onClick={onClose}
              className="flex-1 py-3.5 bg-white/5 text-zinc-300 font-bold rounded-2xl hover:bg-white/10 transition-all border border-white/10 active:scale-95"
            >
              Annulla
            </button>
          )}
          <button
            autoFocus
            onClick={() => {
              onClose();
              if (onConfirm) onConfirm();
            }}
            className="flex-1 py-3.5 bg-white text-zinc-900 font-bold rounded-2xl hover:bg-zinc-200 transition-all active:scale-95 shadow-lg"
          >
            {showCancel ? "Conferma" : "OK"}
          </button>
        </div>
      </motion.div>
    </div>
  );
};


// --- Data helpers ---

const OPTIONAL_STRING_FIELDS = [
  "genre",
  "isbn",
  "totalVolumes",
  "system",
  "coverUrl",
  "seriesName",
  "loanedTo",
  "description",
  "notes",
  "review",
] as const;

const isBlank = (v: any) =>
  v === "" || v === null || v === undefined || (typeof v === "number" && isNaN(v));

// Sanitizes a payload before writing it to Firestore. On updates, optional
// fields the user explicitly cleared are removed with deleteField() so that
// e.g. removing a cover, a note or a rating actually persists.
const sanitizeLibraryItemPayload = (raw: any, isUpdate = false) => {
  const result: Record<string, any> = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(raw, k);

  if (typeof raw.title === "string" && raw.title.trim()) {
    result.title = raw.title.trim();
  }
  if (typeof raw.author === "string" && raw.author.trim()) {
    result.author = raw.author.trim();
  } else if (isUpdate && has("author")) {
    result.author = deleteField();
  }
  if (["book", "manga", "gdr"].includes(raw.category)) {
    result.category = raw.category;
  } else if (!isUpdate) {
    result.category = "book";
  }
  if (["unread", "reading", "read"].includes(raw.status)) {
    result.status = raw.status;
  } else if (!isUpdate) {
    result.status = "unread";
  }

  for (const field of OPTIONAL_STRING_FIELDS) {
    if (typeof raw[field] === "string" && raw[field].trim().length > 0) {
      result[field] = raw[field].trim();
    } else if (isUpdate && has(field) && isBlank(raw[field])) {
      result[field] = deleteField();
    }
  }

  const numberField = (
    key: string,
    parse: (v: string) => number,
    valid: (n: number) => boolean,
  ) => {
    if (!isBlank(raw[key])) {
      const n = parse(String(raw[key]));
      if (!isNaN(n) && valid(n)) {
        result[key] = n;
        return;
      }
    }
    if (isUpdate && has(key)) result[key] = deleteField();
  };
  numberField("price", parseFloat, (n) => n >= 0);
  numberField("totalPages", (v) => parseInt(v, 10), (n) => n > 0);
  numberField("pagesRead", (v) => parseInt(v, 10), (n) => n >= 0);
  numberField("rating", (v) => parseInt(v, 10), (n) => n > 0 && n <= 5);
  numberField("volumeNumber", (v) => parseInt(v, 10), (n) => n > 0);

  if (raw.isWishlist === true) result.isWishlist = true;
  else if (raw.isWishlist === false) result.isWishlist = false;

  if (raw.loanDate && typeof result.loanedTo === "string") {
    const d = toDate(raw.loanDate);
    if (d) result.loanDate = d;
  } else if (isUpdate && has("loanDate") && !raw.loanedTo) {
    result.loanDate = deleteField();
  }

  if (Array.isArray(raw.tags)) {
    const cleanTags = Array.from(
      new Set<string>(
        raw.tags.map((t: any) => String(t).trim()).filter((t: string) => t.length > 0),
      ),
    );
    if (cleanTags.length > 0) result.tags = cleanTags;
    else if (isUpdate && has("tags")) result.tags = deleteField();
  }

  delete result.id;
  delete result.volumeCount;
  delete result.userId;
  delete result.createdAt;
  return result;
};

// Gracefully handles both strict rules (requiring updatedAt) and
// schema-restricted rules (disallowing unknown fields or timestamps).
const safeUpdateDoc = async (docRef: any, data: any, uid?: string) => {
  try {
    await updateDoc(docRef, { ...data, updatedAt: serverTimestamp() });
    return;
  } catch (err1: any) {
    const isPermissionErr =
      err1?.code === "permission-denied" ||
      err1?.message?.includes("permissions");
    if (!isPermissionErr) throw err1;

    try {
      await updateDoc(docRef, data);
      return;
    } catch {
      const withoutVolume = { ...data };
      delete withoutVolume.volumeNumber;
      try {
        await updateDoc(docRef, withoutVolume);
        return;
      } catch {
        if (uid) {
          try {
            await updateDoc(docRef, { ...data, userId: uid });
            return;
          } catch {
            throw err1;
          }
        }
        throw err1;
      }
    }
  }
};

const STATUS_ORDER: Record<Status, number> = { reading: 0, unread: 1, read: 2 };

const STATUS_TERMS: Record<Status, string[]> = {
  unread: ["unread", "to read", "toread", "da leggere", "non letto", "non letta", "non letti", "non lette", "da iniziare", "nuovo", "nuovi"],
  reading: ["reading", "in lettura", "inlettura", "leggendo", "in progress", "in corso", "lettura", "iniziato", "iniziata"],
  read: ["read", "finished", "completed", "letto", "letta", "letti", "lette", "finito", "finita", "finiti", "finite", "completato", "completata", "completati"],
};

const CATEGORY_TERMS: Record<Category, string[]> = {
  book: ["book", "books", "libro", "libri", "classic", "classico", "classici", "romanzo", "romanzi"],
  manga: ["manga", "fumetto", "fumetti", "comic", "comics", "anime"],
  gdr: ["gdr", "rpg", "gioco di ruolo", "giochi di ruolo", "role playing"],
};

const normalize = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const csvEscape = (v: any) => {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const downloadFile = (content: string, filename: string, type: string) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

type ViewMode = "shelf" | "library" | "dashboard" | "wishlist";
type StatusFilter = "all" | Status | "loaned";

interface ToastState {
  id: number;
  message: string;
  submessage?: string;
  variant: "success" | "error" | "info";
  action?: { label: string; onClick: () => void };
}

const readStorage = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const writeStorage = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable (private mode): ignore
  }
};

const SkeletonGrid = () => (
  <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6" aria-busy="true" aria-label="Caricamento libreria">
    {Array.from({ length: 10 }).map((_, i) => (
      <div key={i} className="glass-card p-4 rounded-2xl flex sm:flex-col gap-4 animate-pulse">
        <div className="w-20 h-28 sm:w-full sm:h-auto sm:aspect-[2/3] rounded-xl bg-white/5" />
        <div className="flex-1 space-y-2">
          <div className="h-3 rounded bg-white/10 w-3/4" />
          <div className="h-2.5 rounded bg-white/5 w-1/2" />
          <div className="h-2.5 rounded bg-white/5 w-1/3" />
        </div>
      </div>
    ))}
  </div>
);

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);
  const [view, setView] = useState<ViewMode>(() => {
    const saved = readStorage("nerdshelf_view", "library");
    return (["shelf", "library", "dashboard", "wishlist"].includes(saved) ? saved : "library") as ViewMode;
  });
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>(
    () => readStorage("nerdshelf_sort", "date") as SortOption,
  );
  const [groupBySeries, setGroupBySeries] = useState(
    () => readStorage("nerdshelf_group", "0") === "1",
  );
  const [collapsedSeries, setCollapsedSeries] = useState<Record<string, boolean>>({});

  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm?: () => void;
    showCancel?: boolean;
  }>({ isOpen: false, title: "", message: "" });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LibraryItem | null>(null);
  const [newItemPreset, setNewItemPreset] = useState<Partial<LibraryItem> | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimer = React.useRef<number | undefined>(undefined);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const showToast = React.useCallback(
    (
      message: string,
      submessage?: string,
      variant: ToastState["variant"] = "success",
      action?: ToastState["action"],
    ) => {
      const id = Date.now();
      setToast({ id, message, submessage, variant, action });
      window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(
        () => setToast((curr) => (curr?.id === id ? null : curr)),
        action ? 6000 : 4000,
      );
    },
    [],
  );

  // Route Firestore errors to a toast instead of crashing the app.
  useEffect(() => {
    firestoreErrorListener = (info) =>
      showToast(describeFirestoreError(info), info.error.slice(0, 140), "error");
    return () => {
      firestoreErrorListener = null;
    };
  }, [showToast]);

  useEffect(() => writeStorage("nerdshelf_sort", sortBy), [sortBy]);
  useEffect(() => writeStorage("nerdshelf_view", view), [view]);
  useEffect(() => writeStorage("nerdshelf_group", groupBySeries ? "1" : "0"), [groupBySeries]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) {
      setItems([]);
      setItemsLoaded(false);
      return;
    }

    const q = query(
      collection(db, "libraryItems"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc"),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as LibraryItem[];
        setItems(data);
        setItemsLoaded(true);
      },
      (error) => {
        setItemsLoaded(true);
        handleFirestoreError(error, OperationType.LIST, "libraryItems");
      },
    );

    return unsubscribe;
  }, [user]);

  // Connection test
  useEffect(() => {
    getDocFromServer(doc(db, "test", "connection")).catch((error) => {
      if (error instanceof Error && error.message.includes("the client is offline")) {
        console.error("Firebase connection error: check your configuration.");
      }
    });
  }, []);

  // Selection is scoped to the current view.
  useEffect(() => {
    setSelectedIds([]);
    setIsSelectionMode(false);
    setIsFilterMenuOpen(false);
  }, [view]);

  const selectedItemDetails = useMemo(
    () => (detailsId ? items.find((i) => i.id === detailsId) || null : null),
    [detailsId, items],
  );

  // Close details if the item disappears (e.g. deleted from another device).
  useEffect(() => {
    if (detailsId && itemsLoaded && !items.some((i) => i.id === detailsId)) {
      setDetailsId(null);
    }
  }, [detailsId, items, itemsLoaded]);

  const viewItems = useMemo(
    () => items.filter((i) => (view === "wishlist" ? i.isWishlist : !i.isWishlist)),
    [items, view],
  );

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    viewItems.forEach((item) => (item.tags || []).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([t]) => t);
  }, [viewItems]);

  const categoryCounts = useMemo(() => {
    const c: Record<string, number> = { all: viewItems.length, book: 0, manga: 0, gdr: 0 };
    viewItems.forEach((i) => (c[i.category] = (c[i.category] || 0) + 1));
    return c;
  }, [viewItems]);

  // Reset a tag filter that no longer exists in the current view.
  useEffect(() => {
    if (!["all", "book", "manga", "gdr"].includes(filter) && !allTags.includes(filter)) {
      setFilter("all");
    }
  }, [allTags, filter]);

  const filteredItems = useMemo(() => {
    const rawSearch = normalize(search.trim());

    const result = viewItems.filter((item) => {
      if (rawSearch) {
        const corpus = normalize(
          [
            item.title,
            item.author,
            item.seriesName || "",
            item.genre || "",
            item.notes || "",
            item.description || "",
            item.review || "",
            item.isbn || "",
            item.system || "",
            item.status,
            ...(STATUS_TERMS[item.status] || []),
            item.category,
            ...(CATEGORY_TERMS[item.category] || []),
            ...(item.tags || []),
            item.loanedTo ? `loaned prestato prestito ${item.loanedTo}` : "",
            getVolume(item) !== undefined ? `vol ${getVolume(item)} volume ${getVolume(item)}` : "",
          ].join(" "),
        );
        if (!corpus.includes(rawSearch)) {
          const tokens = rawSearch.split(/\s+/).filter(Boolean);
          if (!(tokens.length > 0 && tokens.every((tok) => corpus.includes(tok)))) return false;
        }
      }

      if (filter !== "all") {
        if (["book", "manga", "gdr"].includes(filter)) {
          if (item.category !== filter) return false;
        } else if (!(item.tags && item.tags.includes(filter))) {
          return false;
        }
      }

      if (statusFilter === "loaned") {
        if (!item.loanedTo) return false;
      } else if (statusFilter !== "all" && item.status !== statusFilter) {
        return false;
      }
      return true;
    });

    const createdTime = (i: LibraryItem) => toDate(i.createdAt)?.getTime() ?? Date.now();
    const bySeries = (a: LibraryItem, b: LibraryItem) => {
      const cmp = (a.seriesName || a.title).localeCompare(b.seriesName || b.title, undefined, { numeric: true });
      if (cmp !== 0) return cmp;
      return (getVolume(a) ?? 0) - (getVolume(b) ?? 0);
    };

    return result.sort((a, b) => {
      switch (sortBy) {
        case "title":
          return a.title.localeCompare(b.title, undefined, { numeric: true });
        case "series":
          return bySeries(a, b);
        case "author":
          return (a.author || "").localeCompare(b.author || "") || bySeries(a, b);
        case "status":
          return (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || bySeries(a, b);
        case "volume":
          return (getVolume(a) ?? Infinity) - (getVolume(b) ?? Infinity) || bySeries(a, b);
        case "rating":
          return (b.rating || 0) - (a.rating || 0) || bySeries(a, b);
        default:
          return createdTime(b) - createdTime(a);
      }
    });
  }, [viewItems, search, filter, statusFilter, sortBy]);

  const groupedItems = useMemo(() => {
    const groups: Record<string, LibraryItem[]> = {};
    const standalone: LibraryItem[] = [];
    filteredItems.forEach((item) => {
      if (item.seriesName) {
        (groups[item.seriesName] ||= []).push(item);
      } else {
        standalone.push(item);
      }
    });
    const seriesList = Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, list]) => {
        const sorted = [...list].sort((a, b) => (getVolume(a) ?? 0) - (getVolume(b) ?? 0));
        // Missing-volume detection uses the whole collection, not just matches.
        const allOwned = items.filter((i) => i.seriesName === name && !i.isWishlist);
        const volumes = allOwned.map(getVolume).filter((v): v is number => v !== undefined);
        const wished = new Set(
          items
            .filter((i) => i.seriesName === name && i.isWishlist)
            .map(getVolume)
            .filter((v): v is number => v !== undefined),
        );
        return {
          name,
          items: sorted,
          readCount: list.filter((i) => i.status === "read").length,
          missing: view === "wishlist" ? [] : findMissingVolumes(volumes).filter((v) => !wished.has(v)),
          nextVolume: volumes.length ? Math.max(...volumes) + 1 : undefined,
          sample: sorted[0],
        };
      });
    return { seriesList, standalone };
  }, [filteredItems, items, view]);

  const totalSelectedPrice = useMemo(
    () =>
      items
        .filter((item) => selectedIds.includes(item.id))
        .reduce((sum, item) => sum + (Number(item.price) || 0), 0),
    [items, selectedIds],
  );

  const activeFilterCount =
    (filter !== "all" ? 1 : 0) + (statusFilter !== "all" ? 1 : 0) + (search.trim() ? 1 : 0);

  const resetFilters = () => {
    setFilter("all");
    setStatusFilter("all");
    setSearch("");
  };

  // --- Actions ---

  const openNewItem = (preset?: Partial<LibraryItem>) => {
    setEditingItem(null);
    setNewItemPreset(
      preset ?? {
        isWishlist: view === "wishlist",
        ...(["book", "manga", "gdr"].includes(filter) ? { category: filter as Category } : {}),
      },
    );
    setIsModalOpen(true);
  };

  const openEditItem = (item: LibraryItem) => {
    setNewItemPreset(null);
    setEditingItem(item);
    setIsModalOpen(true);
  };

  const handleSaveItem = async (data: any) => {
    if (!user) return;

    if (Array.isArray(data)) {
      try {
        for (let i = 0; i < data.length; i += 450) {
          const batch = writeBatch(db);
          data.slice(i, i + 450).forEach((entry) => {
            const clean = sanitizeLibraryItemPayload(entry, false);
            batch.set(doc(collection(db, "libraryItems")), {
              ...clean,
              userId: user.uid,
              createdAt: serverTimestamp(),
            });
          });
          await batch.commit();
        }
        showToast(`${data.length} volumi aggiunti`, data[0]?.seriesName || data[0]?.title);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, "libraryItems");
      }
      return;
    }

    const target = editingItem;
    try {
      if (target) {
        await safeUpdateDoc(
          doc(db, "libraryItems", target.id),
          sanitizeLibraryItemPayload(data, true),
          user.uid,
        );
        showToast("Modifiche salvate", data.title);
      } else {
        await addDoc(collection(db, "libraryItems"), {
          ...sanitizeLibraryItemPayload(data, false),
          userId: user.uid,
          createdAt: serverTimestamp(),
        });
        showToast(
          data.isWishlist ? "Aggiunto alla wishlist" : "Aggiunto alla collezione",
          data.title,
        );
      }
    } catch (error) {
      handleFirestoreError(
        error,
        target ? OperationType.UPDATE : OperationType.CREATE,
        "libraryItems",
      );
    }
  };

  const handlePatch = async (id: string, patch: Partial<LibraryItem>) => {
    const payload: Record<string, any> = { ...patch };
    if ("rating" in patch && !patch.rating) payload.rating = deleteField();
    try {
      await safeUpdateDoc(doc(db, "libraryItems", id), payload, user?.uid);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `libraryItems/${id}`);
    }
  };

  const handleUpdateLoan = async (id: string, loanedTo: string, loanDate: Date | null) => {
    const updates: any = loanedTo
      ? { loanedTo, loanDate }
      : { loanedTo: deleteField(), loanDate: deleteField() };
    try {
      await safeUpdateDoc(doc(db, "libraryItems", id), updates, user?.uid);
      showToast(loanedTo ? `Prestato a ${loanedTo}` : "Segnato come restituito");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `libraryItems/${id}`);
    }
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    const id = itemToDelete;
    const title = items.find((i) => i.id === id)?.title;
    setItemToDelete(null);
    if (detailsId === id) setDetailsId(null);
    try {
      await deleteDoc(doc(db, "libraryItems", id));
      showToast("Elemento eliminato", title, "info");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `libraryItems/${id}`);
    }
  };

  const handleMarkAsBought = async (item: LibraryItem) => {
    try {
      await safeUpdateDoc(
        doc(db, "libraryItems", item.id),
        { isWishlist: false, status: item.status || "unread" },
        user?.uid,
      );
      showToast(`"${item.title}" comprato!`, "Spostato dalla wishlist alla libreria 📚", "success", {
        label: "Annulla",
        onClick: () => handlePatch(item.id, { isWishlist: true }),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `libraryItems/${item.id}`);
    }
  };

  const handleBulkMarkAsBought = async () => {
    if (selectedIds.length === 0) return;
    const ids = [...selectedIds];
    try {
      await Promise.all(
        ids.map((id) => safeUpdateDoc(doc(db, "libraryItems", id), { isWishlist: false }, user?.uid)),
      );
      showToast(`${ids.length} elementi comprati!`, "Spostati nella tua libreria 📚", "success", {
        label: "Annulla",
        onClick: () => ids.forEach((id) => handlePatch(id, { isWishlist: true })),
      });
      setSelectedIds([]);
      setIsSelectionMode(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "bulk-bought");
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const handleSelectAll = () => {
    const visibleIds = filteredItems.map((i) => i.id);
    const allSelected = visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds(allSelected ? [] : visibleIds);
  };

  const handleBulkUpdate = async (updates: any, addTag?: string) => {
    const ids = [...selectedIds];
    try {
      await Promise.all(
        ids.map((id) => {
          const patch = { ...updates };
          if (addTag) {
            const current = items.find((i) => i.id === id)?.tags || [];
            if (!current.includes(addTag)) patch.tags = [...current, addTag];
          }
          if (patch.status === "read") {
            const it = items.find((i) => i.id === id);
            if (it?.totalPages) patch.pagesRead = it.totalPages;
          }
          return safeUpdateDoc(doc(db, "libraryItems", id), patch, user?.uid);
        }),
      );
      showToast(`${ids.length} elementi aggiornati`);
      setSelectedIds([]);
      setIsSelectionMode(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "bulk");
    }
  };

  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    setIsBulkDeleteConfirmOpen(false);
    try {
      for (let i = 0; i < ids.length; i += 450) {
        const batch = writeBatch(db);
        ids.slice(i, i + 450).forEach((id) => batch.delete(doc(db, "libraryItems", id)));
        await batch.commit();
      }
      showToast(`${ids.length} elementi eliminati`, undefined, "info");
      setSelectedIds([]);
      setIsSelectionMode(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, "bulk");
    }
  };

  const showAlert = (title: string, message: string, onConfirm?: () => void, showCancel = false) => {
    setAlertConfig({ isOpen: true, title, message, onConfirm, showCancel });
  };

  const backupDate = () => new Date().toISOString().split("T")[0];

  const handleExportData = () => {
    const serializable = items.map(({ createdAt, loanDate, ...rest }) => ({
      ...rest,
      createdAt: toDate(createdAt)?.toISOString(),
      ...(loanDate ? { loanDate: toDate(loanDate)?.toISOString() } : {}),
    }));
    downloadFile(
      JSON.stringify(serializable, null, 2),
      `nerdshelf_backup_${backupDate()}.json`,
      "application/json",
    );
    showToast("Backup esportato", `${items.length} elementi salvati in JSON`);
  };

  const handleExportCsv = () => {
    const columns: [string, (i: LibraryItem) => any][] = [
      ["Titolo", (i) => i.title],
      ["Autore", (i) => i.author],
      ["Categoria", (i) => CATEGORY_LABELS[i.category]],
      ["Serie", (i) => i.seriesName],
      ["Volume", (i) => getVolume(i)],
      ["Stato", (i) => ({ unread: "Da leggere", reading: "In lettura", read: "Finito" })[i.status]],
      ["Wishlist", (i) => (i.isWishlist ? "Sì" : "No")],
      ["Pagine lette", (i) => i.pagesRead],
      ["Pagine totali", (i) => i.totalPages],
      ["Prezzo", (i) => (i.price !== undefined ? Number(i.price).toFixed(2) : "")],
      ["Voto", (i) => i.rating],
      ["Genere", (i) => i.genre],
      ["Sistema", (i) => i.system],
      ["ISBN", (i) => i.isbn],
      ["Tag", (i) => (i.tags || []).join(", ")],
      ["Prestato a", (i) => i.loanedTo],
      ["Data prestito", (i) => formatDate(i.loanDate)],
      ["Aggiunto il", (i) => formatDate(i.createdAt)],
    ];
    const rows = [
      columns.map(([h]) => h).join(";"),
      ...items.map((item) => columns.map(([, get]) => csvEscape(get(item))).join(";")),
    ];
    // BOM so Excel opens UTF-8 (accents) correctly.
    downloadFile("﻿" + rows.join("\n"), `nerdshelf_${backupDate()}.csv`, "text/csv;charset=utf-8");
    showToast("CSV esportato", "Apribile con Excel, Numbers o Google Sheets");
  };

  const handleImportData = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file || !user) return;

      const reader = new FileReader();
      reader.onload = async (event: any) => {
        let parsed: any;
        try {
          parsed = JSON.parse(event.target.result);
        } catch (err) {
          console.error(err);
          showAlert("File non valido", "Il contenuto del file non è un JSON valido.");
          return;
        }
        if (!Array.isArray(parsed)) {
          showAlert("Formato non valido", "Il backup deve contenere un elenco di elementi.");
          return;
        }

        const key = (i: any) =>
          `${normalize(String(i.title || ""))}|${getVolume(i) ?? ""}|${i.category || "book"}|${i.isWishlist ? 1 : 0}`;
        const existing = new Set(items.map(key));
        const valid = parsed
          .filter((i) => i && typeof i.title === "string" && i.title.trim())
          .map((i) => ({ raw: i, clean: sanitizeLibraryItemPayload(i, false) }));
        const fresh = valid.filter(({ raw }) => !existing.has(key(raw)));
        const skippedDup = valid.length - fresh.length;
        const skippedInvalid = parsed.length - valid.length;

        if (fresh.length === 0) {
          showAlert(
            "Niente da importare",
            skippedDup
              ? `Tutti i ${skippedDup} elementi sono già presenti nella tua libreria.`
              : "Il file non contiene elementi validi.",
          );
          return;
        }

        const performImport = async () => {
          try {
            for (let i = 0; i < fresh.length; i += 450) {
              const batch = writeBatch(db);
              fresh.slice(i, i + 450).forEach(({ clean }) => {
                batch.set(doc(collection(db, "libraryItems")), {
                  ...clean,
                  userId: user.uid,
                  createdAt: serverTimestamp(),
                });
              });
              await batch.commit();
            }
            showToast("Importazione completata", `${fresh.length} elementi aggiunti`);
          } catch (err) {
            console.error(err);
            showAlert("Importazione fallita", "Errore durante il salvataggio dei dati importati.");
          }
        };

        const notes = [
          skippedDup ? `${skippedDup} già presenti verranno saltati.` : "",
          skippedInvalid ? `${skippedInvalid} senza titolo verranno ignorati.` : "",
        ]
          .filter(Boolean)
          .join("\n");
        showAlert(
          "Conferma importazione",
          `Importare ${fresh.length} elementi nella tua libreria?${notes ? `\n\n${notes}` : ""}`,
          performImport,
          true,
        );
      };
      reader.readAsText(file);
    };
    input.click();
  };

  // --- Keyboard shortcuts: "/" search, "n" new item ---
  const anyModalOpen =
    isModalOpen || !!detailsId || !!itemToDelete || isBulkEditModalOpen || isBulkDeleteConfirmOpen || alertConfig.isOpen;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (anyModalOpen || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable) {
        if (e.key === "Escape" && target === searchInputRef.current) {
          setSearch("");
          target.blur();
        }
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        if (view === "dashboard") setView("library");
        searchInputRef.current?.focus();
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        openNewItem();
      } else if (e.key === "Escape") {
        setIsFilterMenuOpen(false);
        setIsProfileMenuOpen(false);
        if (isSelectionMode) {
          setIsSelectionMode(false);
          setSelectedIds([]);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (loading)
    return (
      <div className="min-h-screen bg-transparent flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-zinc-800 border-t-white rounded-full animate-spin" />
      </div>
    );

  if (!user) return <AuthScreen />;

  const renderCard = (item: LibraryItem) => (
    <ItemCard
      key={item.id}
      item={item}
      onOpenDetails={(it) => setDetailsId(it.id)}
      onEdit={openEditItem}
      onMarkAsBought={handleMarkAsBought}
      isSelected={selectedIds.includes(item.id)}
      onSelect={toggleSelection}
      selectionMode={isSelectionMode}
    />
  );

  const gridClass = "grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-6";

  const viewTabs: { id: ViewMode; label: string; icon: typeof Book }[] = [
    { id: "library", label: "Griglia", icon: LayoutGrid },
    { id: "shelf", label: "Scaffale", icon: Layers },
    { id: "dashboard", label: "Statistiche", icon: BarChart3 },
    { id: "wishlist", label: "Wishlist", icon: Heart },
  ];

  const statusOptions: { id: StatusFilter; label: string }[] = [
    { id: "all", label: "Tutti" },
    { id: "reading", label: "In lettura" },
    { id: "unread", label: "Da leggere" },
    { id: "read", label: "Finiti" },
    { id: "loaned", label: "In prestito" },
  ];

  const libraryIsEmpty = itemsLoaded && viewItems.length === 0;

  const filterBar = (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
        <CategoryChip
          label={`Tutto · ${categoryCounts.all}`}
          active={filter === "all"}
          onClick={() => setFilter("all")}
          colorClass="bg-white text-zinc-900 border-white"
        />
        <CategoryChip
          label={`Libri · ${categoryCounts.book}`}
          active={filter === "book"}
          onClick={() => setFilter(filter === "book" ? "all" : "book")}
          colorClass="bg-amber-500/20 text-amber-300 border-amber-500/40"
        />
        <CategoryChip
          label={`Manga · ${categoryCounts.manga}`}
          active={filter === "manga"}
          onClick={() => setFilter(filter === "manga" ? "all" : "manga")}
          colorClass="bg-purple-500/20 text-purple-300 border-purple-500/40"
        />
        <CategoryChip
          label={`GDR · ${categoryCounts.gdr}`}
          active={filter === "gdr"}
          onClick={() => setFilter(filter === "gdr" ? "all" : "gdr")}
          colorClass="bg-red-500/20 text-red-300 border-red-500/40"
        />
        {allTags.length > 0 && <div className="w-px bg-white/10 shrink-0 my-1" />}
        {allTags.map((tag) => (
          <CategoryChip
            key={tag}
            label={`#${tag}`}
            active={filter === tag}
            onClick={() => setFilter(filter === tag ? "all" : tag)}
            colorClass="bg-sky-500/20 text-sky-300 border-sky-500/40"
          />
        ))}
      </div>
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
        {statusOptions.map((s) => (
          <button
            key={s.id}
            onClick={() => setStatusFilter(s.id)}
            aria-pressed={statusFilter === s.id}
            className={cn(
              "px-3 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all",
              statusFilter === s.id
                ? "bg-white/15 text-white"
                : "text-zinc-500 hover:text-zinc-200 hover:bg-white/5",
            )}
          >
            {s.label}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-zinc-500 whitespace-nowrap pl-2">
          {filteredItems.length} {filteredItems.length === 1 ? "elemento" : "elementi"}
        </span>
        {activeFilterCount > 0 && (
          <button
            onClick={resetFilters}
            className="text-[11px] font-semibold text-[var(--color-brand-orange)] hover:underline whitespace-nowrap"
          >
            Azzera filtri
          </button>
        )}
      </div>
    </div>
  );

  const emptyState = libraryIsEmpty ? (
    <motion.div
      key="empty-library"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-3xl p-8 sm:p-12 text-center space-y-5 max-w-xl mx-auto"
    >
      <div className="inline-flex p-5 rounded-full bg-white/5">
        {view === "wishlist" ? (
          <Heart className="w-10 h-10 text-rose-400/60" />
        ) : (
          <Logo className="w-12 h-12" />
        )}
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-serif font-bold text-white">
          {view === "wishlist" ? "La wishlist è vuota" : "Il tuo scaffale ti aspetta"}
        </h2>
        <p className="text-sm text-zinc-400">
          {view === "wishlist"
            ? "Aggiungi i libri, manga e manuali che vorresti comprare: quando li acquisti, un tap e finiscono in libreria."
            : "Aggiungi il tuo primo libro, manga o manuale GDR. Puoi anche scansionare l'ISBN o importare un backup."}
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2 justify-center">
        <button
          onClick={() => openNewItem()}
          className={cn(
            "px-5 py-3 font-bold rounded-xl inline-flex items-center justify-center gap-2 transition-all active:scale-95",
            view === "wishlist" ? "bg-rose-600 hover:bg-rose-500 text-white" : "bg-white hover:bg-zinc-200 text-zinc-900",
          )}
        >
          <Plus className="w-4 h-4" />
          {view === "wishlist" ? "Aggiungi un desiderio" : "Aggiungi il primo"}
        </button>
        {view !== "wishlist" && (
          <button
            onClick={handleImportData}
            className="px-5 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-200 font-semibold rounded-xl inline-flex items-center justify-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Importa backup
          </button>
        )}
      </div>
    </motion.div>
  ) : (
    <motion.div
      key="empty-state"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="text-center py-16 space-y-4"
    >
      <div className="inline-flex p-6 rounded-full bg-white/5 text-zinc-600">
        <Search className="w-10 h-10" />
      </div>
      <div className="space-y-1">
        <p className="text-zinc-300 font-medium">
          {search ? `Nessun risultato per "${search}"` : "Nessun elemento corrisponde ai filtri"}
        </p>
        <p className="text-zinc-500 text-xs">
          Puoi cercare per titolo, autore, serie, tag o stato (es. "letto", "da leggere", "prestato").
        </p>
      </div>
      <button
        onClick={resetFilters}
        className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl transition-all"
      >
        Azzera filtri
      </button>
    </motion.div>
  );

  return (
    <div className="min-h-screen pb-28 sm:pb-24 relative overflow-x-hidden">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] bg-purple-900/20 rounded-full blur-[120px] mix-blend-screen opacity-50"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] bg-red-900/20 rounded-full blur-[120px] mix-blend-screen opacity-50"></div>
        <div className="absolute top-[40%] left-[60%] w-[30vw] h-[30vw] bg-blue-900/10 rounded-full blur-[100px] mix-blend-screen opacity-30"></div>
      </div>

      {/* Click-outside layer for dropdowns */}
      {(isFilterMenuOpen || isProfileMenuOpen) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setIsFilterMenuOpen(false);
            setIsProfileMenuOpen(false);
          }}
        />
      )}

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 w-full bg-[#0b0b0d]/80 backdrop-blur-xl border-b border-white/10 shadow-lg pt-[env(safe-area-inset-top)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between gap-3 sm:gap-4">
            <button
              onClick={() => setView("library")}
              className="flex items-center space-x-3 shrink-0"
              aria-label="NerdShelf, vai alla libreria"
            >
              <Logo className="w-8 h-8" />
              <h1 className="text-xl font-serif font-bold text-white hidden sm:block">
                Nerd<span className="text-[var(--color-brand-orange)]">Shelf</span>
              </h1>
            </button>

            {/* Search */}
            <div className="flex-1 max-w-2xl relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="search"
                aria-label="Cerca nella libreria"
                className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-14 text-base sm:text-sm text-white focus:outline-none focus:border-[var(--color-brand-orange)] focus:bg-white/10 transition-all placeholder-zinc-500 [&::-webkit-search-cancel-button]:hidden"
                placeholder="Cerca titolo, autore, serie, tag..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  if (view === "dashboard") setView("library");
                }}
              />
              {search ? (
                <button
                  onClick={() => {
                    setSearch("");
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors p-1"
                  aria-label="Cancella ricerca"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : (
                <kbd className="hidden sm:block absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-zinc-500 border border-white/10 rounded px-1.5 py-0.5">
                  /
                </kbd>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center space-x-1 sm:space-x-2 shrink-0 relative">
              <button
                onClick={() => {
                  setIsFilterMenuOpen(!isFilterMenuOpen);
                  setIsProfileMenuOpen(false);
                }}
                aria-expanded={isFilterMenuOpen}
                aria-label="Ordina e visualizza"
                className={cn(
                  "p-2.5 rounded-xl border transition-all flex items-center space-x-2 relative z-50",
                  isFilterMenuOpen || isSelectionMode || sortBy !== "date" || groupBySeries
                    ? "bg-white/10 border-white/30 text-white"
                    : "bg-transparent border-transparent hover:bg-white/5 text-zinc-400 hover:text-white",
                )}
                title="Ordina e visualizza"
              >
                <Filter className="w-5 h-5" />
                <span className="hidden md:block text-xs font-bold uppercase tracking-widest">Ordina</span>
              </button>

              <button
                onClick={() => {
                  setIsProfileMenuOpen(!isProfileMenuOpen);
                  setIsFilterMenuOpen(false);
                }}
                aria-expanded={isProfileMenuOpen}
                aria-label="Menu profilo"
                className={cn(
                  "p-1.5 rounded-xl border transition-all relative z-50",
                  isProfileMenuOpen
                    ? "bg-white/10 border-white/30 text-white"
                    : "bg-transparent border-transparent hover:bg-white/5 text-zinc-400 hover:text-white",
                )}
              >
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="w-7 h-7 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-7 h-7 flex items-center justify-center">
                    <UserIcon className="w-5 h-5" />
                  </div>
                )}
              </button>

              {isFilterMenuOpen && (
                <div className="absolute top-full right-0 sm:right-12 mt-2 w-64 bg-[#121215] border border-white/10 rounded-2xl shadow-2xl p-4 z-50 flex flex-col gap-4">
                  <div className="space-y-1">
                    <label htmlFor="sort-select" className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">
                      Ordina per
                    </label>
                    <select
                      id="sort-select"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SortOption)}
                      className="w-full bg-white/5 border border-white/10 text-sm font-bold text-white rounded-lg px-3 py-2 focus:outline-none"
                    >
                      <option value="date" className="bg-zinc-900">Più recenti</option>
                      <option value="title" className="bg-zinc-900">Titolo</option>
                      <option value="author" className="bg-zinc-900">Autore</option>
                      <option value="series" className="bg-zinc-900">Serie e volume</option>
                      <option value="status" className="bg-zinc-900">Stato di lettura</option>
                      <option value="volume" className="bg-zinc-900">Numero volume</option>
                      <option value="rating" className="bg-zinc-900">Voto</option>
                    </select>
                  </div>
                  <div className="space-y-1 pt-2 border-t border-white/5">
                    <button
                      onClick={() => setGroupBySeries(!groupBySeries)}
                      className={cn(
                        "w-full flex items-center justify-between p-2 rounded-lg transition-all",
                        groupBySeries ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white",
                      )}
                    >
                      <div className="flex items-center space-x-2">
                        <Layers className="w-4 h-4" />
                        <span className="text-sm font-bold">Raggruppa per serie</span>
                      </div>
                      {groupBySeries && <Check className="w-4 h-4 text-[var(--color-brand-orange)]" />}
                    </button>
                    <button
                      onClick={() => {
                        setIsSelectionMode(!isSelectionMode);
                        if (isSelectionMode) setSelectedIds([]);
                        else if (view === "dashboard") setView("library");
                        setIsFilterMenuOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center justify-between p-2 rounded-lg transition-all",
                        isSelectionMode ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white",
                      )}
                    >
                      <div className="flex items-center space-x-2">
                        <ListChecks className="w-4 h-4" />
                        <span className="text-sm font-bold">Selezione multipla</span>
                      </div>
                      {isSelectionMode && <Check className="w-4 h-4 text-[var(--color-brand-orange)]" />}
                    </button>
                  </div>
                </div>
              )}

              {isProfileMenuOpen && (
                <div className="absolute top-full right-0 mt-2 w-72 bg-[#121215] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50">
                  <div className="p-4 border-b border-white/5 flex items-center gap-3">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt="" referrerPolicy="no-referrer" className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                        <UserIcon className="w-5 h-5 text-zinc-400" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">{user.displayName || "Lettore"}</p>
                      <p className="text-[11px] text-zinc-500 truncate">
                        {items.filter((i) => !i.isWishlist).length} in libreria · {items.filter((i) => i.isWishlist).length} in wishlist
                      </p>
                    </div>
                  </div>
                  <div className="p-2 space-y-1 border-b border-white/5">
                    <div className="px-3 py-2 text-[10px] uppercase font-bold text-zinc-500 tracking-widest">Dati</div>
                    <button onClick={() => { handleExportData(); setIsProfileMenuOpen(false); }} className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-zinc-400 hover:bg-white/5 hover:text-white transition-all">
                      <Download className="w-4 h-4" /> <span className="text-sm font-bold">Esporta backup (JSON)</span>
                    </button>
                    <button onClick={() => { handleExportCsv(); setIsProfileMenuOpen(false); }} className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-zinc-400 hover:bg-white/5 hover:text-white transition-all">
                      <FileSpreadsheet className="w-4 h-4" /> <span className="text-sm font-bold">Esporta foglio (CSV)</span>
                    </button>
                    <button onClick={() => { handleImportData(); setIsProfileMenuOpen(false); }} className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-zinc-400 hover:bg-white/5 hover:text-white transition-all">
                      <Upload className="w-4 h-4" /> <span className="text-sm font-bold">Importa backup</span>
                    </button>
                  </div>
                  <div className="hidden sm:block px-5 py-3 border-b border-white/5 text-[11px] text-zinc-500 space-y-1">
                    <div className="flex justify-between"><span>Cerca</span><kbd className="font-mono text-zinc-400">/</kbd></div>
                    <div className="flex justify-between"><span>Nuovo elemento</span><kbd className="font-mono text-zinc-400">N</kbd></div>
                    <div className="flex justify-between"><span>Chiudi / annulla</span><kbd className="font-mono text-zinc-400">Esc</kbd></div>
                  </div>
                  <div className="p-2">
                    <button onClick={() => signOut(auth)} className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all">
                      <LogOut className="w-4 h-4" /> <span className="text-sm font-bold">Esci</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto pt-[calc(5rem+env(safe-area-inset-top))] sm:pt-24 min-h-screen">
        {/* Desktop view tabs */}
        <nav className="hidden sm:flex px-6 pt-2" aria-label="Viste">
          <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
            {viewTabs.map((tab) => {
              const TabIcon = tab.icon;
              const active = view === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setView(tab.id)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all",
                    active
                      ? tab.id === "wishlist"
                        ? "bg-rose-500/20 text-rose-200"
                        : "bg-white text-zinc-900"
                      : "text-zinc-400 hover:text-white hover:bg-white/5",
                  )}
                >
                  <TabIcon className={cn("w-4 h-4", active && tab.id === "wishlist" && "fill-rose-400")} />
                  {tab.label}
                  {tab.id === "wishlist" && items.some((i) => i.isWishlist) && (
                    <span className="text-[10px] font-mono opacity-70">
                      {items.filter((i) => i.isWishlist).length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {view === "dashboard" ? (
          <Dashboard items={items} onOpenDetails={(it) => setDetailsId(it.id)} />
        ) : (
          <div className="p-4 sm:p-6 space-y-6">
            {view === "wishlist" && !libraryIsEmpty && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-gradient-to-r from-rose-950/40 via-purple-950/20 to-zinc-900/80 border border-rose-500/20 rounded-2xl shadow-xl">
                <div className="flex items-center space-x-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
                    <Heart className="w-6 h-6 fill-rose-500/30" />
                  </div>
                  <div>
                    <h2 className="text-xl font-serif font-bold text-white flex items-center gap-2 flex-wrap">
                      <span>La tua wishlist</span>
                      <span className="text-xs font-mono font-normal px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        {viewItems.length}
                        {viewItems.some((i) => i.price)
                          ? ` · ${formatPrice(viewItems.reduce((s, i) => s + (Number(i.price) || 0), 0))}`
                          : ""}
                      </span>
                    </h2>
                    <p className="text-xs text-zinc-400 mt-1">
                      Quando acquisti qualcosa, premi <strong className="text-emerald-400 font-semibold">"Segna come comprato"</strong> per spostarlo in libreria.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => openNewItem({ isWishlist: true })}
                  className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-lg shadow-rose-950/50 transition-all active:scale-95 shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>Aggiungi alla wishlist</span>
                </button>
              </div>
            )}

            {!libraryIsEmpty && itemsLoaded && filterBar}

            {!itemsLoaded ? (
              <SkeletonGrid />
            ) : filteredItems.length === 0 ? (
              emptyState
            ) : view === "shelf" ? (
              <ShelfView
                items={filteredItems}
                onEdit={openEditItem}
                onOpenDetails={(it) => setDetailsId(it.id)}
              />
            ) : groupBySeries ? (
              <div className="space-y-10">
                {groupedItems.seriesList.map((series) => {
                  const collapsed = !!collapsedSeries[series.name];
                  return (
                    <section key={`series-${series.name}`} className="space-y-4">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <button
                          onClick={() =>
                            setCollapsedSeries((prev) => ({ ...prev, [series.name]: !collapsed }))
                          }
                          aria-expanded={!collapsed}
                          className="flex items-center gap-3 min-w-0 group/series"
                        >
                          <div className="p-2 bg-white/5 rounded-lg border border-white/10 group-hover/series:bg-white/10">
                            <ChevronRight className={cn("w-4 h-4 text-zinc-400 transition-transform", !collapsed && "rotate-90")} />
                          </div>
                          <h2 className="text-lg font-serif font-bold text-white truncate">{series.name}</h2>
                        </button>
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                          {series.items.length} {series.items.length === 1 ? "volume" : "volumi"}
                          {view !== "wishlist" && ` · ${series.readCount} letti`}
                        </span>
                        {series.missing.length > 0 && (
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20"
                            title="Volumi mancanti nella tua collezione (esclusi quelli già in wishlist)"
                          >
                            Mancano: {compressRanges(series.missing)}
                          </span>
                        )}
                        <button
                          onClick={() =>
                            openNewItem({
                              seriesName: series.name,
                              category: series.sample?.category,
                              author: series.sample?.author,
                              isWishlist: view === "wishlist",
                              volumeNumber: series.missing[0] ?? series.nextVolume,
                            })
                          }
                          className="ml-auto text-[11px] font-semibold text-zinc-400 hover:text-white flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-white/5"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          {series.missing[0] ?? series.nextVolume
                            ? `Aggiungi vol. ${series.missing[0] ?? series.nextVolume}`
                            : "Aggiungi volume"}
                        </button>
                      </div>
                      {!collapsed && <div className={gridClass}>{series.items.map(renderCard)}</div>}
                    </section>
                  );
                })}

                {groupedItems.standalone.length > 0 && (
                  <section className="space-y-4">
                    {groupedItems.seriesList.length > 0 && (
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-white/5 rounded-lg border border-white/10">
                          <Book className="w-4 h-4 text-zinc-500" />
                        </div>
                        <h2 className="text-lg font-serif font-bold text-white">Volumi singoli</h2>
                      </div>
                    )}
                    <div className={gridClass}>{groupedItems.standalone.map(renderCard)}</div>
                  </section>
                )}
              </div>
            ) : (
              <div className={gridClass}>
                <AnimatePresence mode="popLayout">{filteredItems.map(renderCard)}</AnimatePresence>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Mobile Nav */}
      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 bg-zinc-950/95 backdrop-blur-xl border-t border-white/10 px-2 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] grid grid-cols-5 items-end z-40"
        aria-label="Navigazione"
      >
        {[
          { id: "library" as ViewMode, label: "Griglia", icon: LayoutGrid },
          { id: "shelf" as ViewMode, label: "Scaffale", icon: Layers },
        ].map((tab) => {
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              aria-current={view === tab.id ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 py-1",
                view === tab.id ? "text-white" : "text-zinc-500",
              )}
            >
              <TabIcon className="w-6 h-6" />
              <span className="text-[10px] font-bold uppercase tracking-wider">{tab.label}</span>
            </button>
          );
        })}

        <button
          onClick={() => openNewItem()}
          className="flex flex-col items-center -mt-7"
          aria-label="Aggiungi elemento"
        >
          <div
            className={cn(
              "w-14 h-14 rounded-full shadow-2xl flex items-center justify-center border-4 border-zinc-950 active:scale-95 transition-transform",
              view === "wishlist" ? "bg-rose-600 text-white" : "bg-white text-zinc-900",
            )}
          >
            <Plus className="w-7 h-7" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider mt-1 text-white">Aggiungi</span>
        </button>

        {[
          { id: "dashboard" as ViewMode, label: "Stats", icon: BarChart3 },
          { id: "wishlist" as ViewMode, label: "Wishlist", icon: Heart },
        ].map((tab) => {
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              aria-current={view === tab.id ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 py-1",
                view === tab.id ? (tab.id === "wishlist" ? "text-rose-300" : "text-white") : "text-zinc-500",
              )}
            >
              <TabIcon className={cn("w-6 h-6", view === "wishlist" && tab.id === "wishlist" && "fill-rose-400/60")} />
              <span className="text-[10px] font-bold uppercase tracking-wider">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* FAB (Desktop Only) */}
      {!isSelectionMode && (
        <button
          onClick={() => openNewItem()}
          className={cn(
            "hidden sm:flex fixed bottom-8 right-8 w-16 h-16 rounded-full shadow-2xl items-center justify-center hover:scale-110 active:scale-95 transition-all z-40",
            view === "wishlist" ? "bg-rose-600 text-white" : "bg-white text-zinc-900",
          )}
          title="Aggiungi elemento (N)"
          aria-label="Aggiungi elemento"
        >
          <Plus className="w-8 h-8" />
        </button>
      )}

      <ItemModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingItem(null);
          setNewItemPreset(null);
        }}
        onSave={handleSaveItem}
        initialData={editingItem}
        preset={newItemPreset}
        existingItems={items}
      />

      <AnimatePresence>
        {isSelectionMode && view !== "dashboard" && (
          <BulkToolbar
            count={selectedIds.length}
            visibleCount={filteredItems.length}
            totalPrice={totalSelectedPrice}
            onEdit={() => setIsBulkEditModalOpen(true)}
            onDelete={() => setIsBulkDeleteConfirmOpen(true)}
            onSelectAll={handleSelectAll}
            onClear={() => {
              setIsSelectionMode(false);
              setSelectedIds([]);
            }}
            isWishlist={view === "wishlist"}
            onMarkAsBought={handleBulkMarkAsBought}
          />
        )}
      </AnimatePresence>

      <DeleteConfirmationModal
        isOpen={isBulkDeleteConfirmOpen}
        count={selectedIds.length}
        onConfirm={handleBulkDelete}
        onCancel={() => setIsBulkDeleteConfirmOpen(false)}
      />

      <BulkEditModal
        isOpen={isBulkEditModalOpen}
        count={selectedIds.length}
        onClose={() => setIsBulkEditModalOpen(false)}
        onSave={handleBulkUpdate}
      />

      <DetailsModal
        item={isModalOpen || itemToDelete ? null : selectedItemDetails}
        allItems={items}
        onClose={() => setDetailsId(null)}
        onPatch={handlePatch}
        onUpdateLoan={handleUpdateLoan}
        onEdit={openEditItem}
        onDelete={(id) => setItemToDelete(id)}
        onMarkAsBought={handleMarkAsBought}
        onNavigate={(it) => setDetailsId(it.id)}
      />

      <DeleteConfirmationModal
        isOpen={!!itemToDelete}
        title={items.find((i) => i.id === itemToDelete)?.title}
        onConfirm={confirmDelete}
        onCancel={() => setItemToDelete(null)}
      />

      <AlertConfirmModal
        isOpen={alertConfig.isOpen}
        title={alertConfig.title}
        message={alertConfig.message}
        onConfirm={alertConfig.onConfirm}
        showCancel={alertConfig.showCancel}
        onClose={() => setAlertConfig((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Toast */}
      <div aria-live="polite" className="contents">
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              role={toast.variant === "error" ? "alert" : "status"}
              className={cn(
                "fixed left-1/2 -translate-x-1/2 z-[110] bg-[#16161a]/95 border text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 backdrop-blur-xl max-w-md w-[92vw] sm:w-auto sm:min-w-[320px]",
                isSelectionMode ? "bottom-44 sm:bottom-28" : "bottom-28 sm:bottom-10",
                toast.variant === "error"
                  ? "border-red-500/40"
                  : toast.variant === "info"
                    ? "border-white/15"
                    : "border-emerald-500/40",
              )}
            >
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                  toast.variant === "error"
                    ? "bg-red-500/20 text-red-400"
                    : toast.variant === "info"
                      ? "bg-white/10 text-zinc-300"
                      : "bg-emerald-500/20 text-emerald-400",
                )}
              >
                {toast.variant === "error" ? (
                  <AlertTriangle className="w-4 h-4" />
                ) : toast.variant === "info" ? (
                  <Info className="w-4 h-4" />
                ) : (
                  <CheckCircle2 className="w-5 h-5" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{toast.message}</p>
                {toast.submessage && <p className="text-xs text-zinc-400 truncate">{toast.submessage}</p>}
              </div>
              {toast.action && (
                <button
                  onClick={() => {
                    toast.action?.onClick();
                    setToast(null);
                  }}
                  className="text-xs font-bold text-[var(--color-brand-orange)] hover:text-orange-300 px-2 py-1 rounded-lg hover:bg-white/5 shrink-0"
                >
                  {toast.action.label}
                </button>
              )}
              <button
                onClick={() => setToast(null)}
                aria-label="Chiudi notifica"
                className="text-zinc-500 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
