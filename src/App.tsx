/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  User 
} from 'firebase/auth';
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
  getDocFromServer
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { 
  Book, 
  Sword, 
  Sparkles, 
  Plus, 
  LogOut, 
  Search, 
  Filter, 
  BookOpen, 
  CheckCircle2, 
  Clock, 
  Trash2,
  ChevronRight,
  X,
  Pencil,
  Scan,
  Heart,
  Layers,
  UserPlus,
  Calendar,
  Handshake
} from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
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
  Legend
} from 'recharts';

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
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
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Types ---
type Category = 'book' | 'manga' | 'gdr';
type Status = 'unread' | 'reading' | 'read';
type SortOption = 'title' | 'author' | 'status' | 'date';

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
        <div className="min-h-screen bg-black flex items-center justify-center p-6">
          <div className="glass-card p-8 rounded-[2rem] border border-red-900/20 max-w-lg w-full space-y-6 text-center">
            <div className="w-16 h-16 bg-red-900/20 rounded-full flex items-center justify-center mx-auto">
              <X className="w-8 h-8 text-red-500" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-serif font-bold text-white">Ops! Qualcosa è andato storto</h2>
              <p className="text-zinc-400 text-sm">
                Si è verificato un errore durante la comunicazione con il database.
              </p>
            </div>
            {this.state.errorInfo && (
              <div className="bg-black/40 p-4 rounded-xl text-left overflow-hidden">
                <p className="text-[10px] uppercase font-bold text-red-500 tracking-widest mb-2">Dettagli Tecnici</p>
                <pre className="text-[10px] text-zinc-500 font-mono whitespace-pre-wrap break-all">
                  {JSON.stringify(this.state.errorInfo, null, 2)}
                </pre>
              </div>
            )}
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-white text-black font-bold rounded-xl hover:bg-zinc-200 transition-all"
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

const ISBNScanner = ({ onScan, onClose }: { onScan: (isbn: string) => void; onClose: () => void }) => {
  useEffect(() => {
    const scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: { width: 250, height: 150 } }, false);
    scanner.render((decodedText) => {
      onScan(decodedText);
      scanner.clear();
      onClose();
    }, (error) => {
      // console.warn(error);
    });
    return () => {
      scanner.clear();
    };
  }, [onScan, onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
      <div className="bg-zinc-900 border border-white/10 w-full max-w-md rounded-[2rem] p-6 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-serif font-bold text-white">Scan ISBN Barcode</h3>
          <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div id="reader" className="overflow-hidden rounded-2xl border border-white/5"></div>
        <p className="text-[10px] text-zinc-500 text-center uppercase tracking-widest">Point your camera at the barcode</p>
      </div>
    </div>
  );
};

const AuthScreen = () => {
  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-900 via-black to-black">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-8 max-w-md w-full"
      >
        <div className="space-y-2">
          <h1 className="text-6xl font-serif font-bold text-white tracking-tighter">
            Nerd<span className="text-red-700">Shelf</span>
          </h1>
          <p className="text-zinc-400 text-lg font-light">Your personal sanctuary for classics, manga, and epic quests.</p>
        </div>

        <div className="glass-card p-8 rounded-3xl space-y-6">
          <div className="flex justify-center space-x-4">
            <Book className="w-8 h-8 text-amber-600" />
            <Sparkles className="w-8 h-8 text-purple-600" />
            <Sword className="w-8 h-8 text-red-700" />
          </div>
          
          <button 
            onClick={handleLogin}
            className="w-full py-4 px-6 bg-white text-black font-semibold rounded-2xl hover:bg-zinc-200 transition-all flex items-center justify-center space-x-3 shadow-xl"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
            <span>Enter the Library</span>
          </button>
          
          <p className="text-xs text-zinc-500 uppercase tracking-widest">Secure Multi-User Access</p>
        </div>
      </motion.div>
    </div>
  );
};

const CategoryChip = ({ 
  label, 
  active, 
  onClick, 
  colorClass 
}: { 
  label: string; 
  active: boolean; 
  onClick: () => void;
  colorClass: string;
}) => (
  <button
    onClick={onClick}
    className={cn(
      "px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap border border-white/5",
      active ? colorClass : "bg-white/5 text-zinc-400 hover:bg-white/10"
    )}
  >
    {label}
  </button>
);

const ItemCard = ({ item, onOpenDetails }: { 
  item: LibraryItem; 
  onOpenDetails: (item: LibraryItem) => void;
  key?: React.Key;
}) => {
  const categoryConfig = {
    book: { icon: Book, color: 'text-amber-600', border: 'category-book', label: 'Classic' },
    manga: { icon: Sparkles, color: 'text-purple-600', border: 'category-manga', label: 'Manga' },
    gdr: { icon: Sword, color: 'text-red-700', border: 'category-gdr', label: 'RPG' }
  };

  const config = categoryConfig[item.category];
  const Icon = config.icon;

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -5 }}
      className={cn("glass-card p-4 rounded-2xl flex flex-row sm:flex-col items-center sm:items-stretch space-x-4 sm:space-x-0 sm:space-y-4 group relative overflow-hidden", config.border)}
    >
      <button 
        onClick={() => onOpenDetails(item)}
        className="w-20 h-28 sm:w-full sm:h-auto sm:aspect-[2/3] flex-shrink-0 bg-zinc-800/50 rounded-lg overflow-hidden relative hover:scale-[1.02] transition-transform active:scale-95 shadow-xl border border-white/5"
      >
        {item.coverUrl ? (
          <img 
            src={item.coverUrl} 
            alt={item.title} 
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className={cn("w-full h-full flex items-center justify-center", config.color)}>
            <Icon className="w-10 h-10 sm:w-12 sm:h-12 opacity-20" />
          </div>
        )}
        {item.loanedTo && (
          <div className="absolute top-2 left-2 bg-amber-500 text-black text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded shadow-lg">
            Loaned
          </div>
        )}
        {item.isWishlist && (
          <div className="absolute top-2 right-2 bg-red-600/90 text-white p-1 rounded-full shadow-lg">
            <Heart className="w-3 h-3 fill-white" />
          </div>
        )}
      </button>
      
      <div className="flex-1 min-w-0 flex flex-col justify-between h-full sm:min-h-[100px]">
        <div className="flex justify-between items-start gap-2">
          <div className="min-w-0">
            <h3 className="text-base font-medium text-white leading-tight line-clamp-2 sm:h-10">{item.title}</h3>
            {/* Mobile Author */}
            <p className="text-xs text-zinc-500 truncate sm:hidden mt-1">{item.author}</p>
          </div>
          {/* Mobile Volume Badge */}
          <div className="sm:hidden">
            {item.category === 'manga' && item.totalVolumes && (
              <span className="text-[9px] font-bold bg-purple-900/30 text-purple-400 px-1.5 py-0.5 rounded border border-purple-700/30 shrink-0">
                Vol. {item.totalVolumes}
              </span>
            )}
          </div>
        </div>

        {/* Desktop Footer / Bottom Row */}
        <div className="flex items-center justify-between mt-auto pt-2">
          <p className="text-xs text-zinc-500 truncate flex-1 mr-2 hidden sm:block">{item.author}</p>
          
          {/* Desktop Volume Badge */}
          <div className="hidden sm:block">
            {item.category === 'manga' && item.totalVolumes && (
              <span className="text-[9px] font-bold bg-purple-900/30 text-purple-400 px-1.5 py-0.5 rounded border border-purple-700/30 shrink-0">
                Vol. {item.totalVolumes}
              </span>
            )}
          </div>
        </div>
        
        {item.totalPages && item.totalPages > 0 && (
          <div className="mt-3 w-full bg-white/5 h-1 rounded-full overflow-hidden">
            <div 
              className="h-full bg-white/20 transition-all" 
              style={{ width: `${Math.min(100, ((item.pagesRead || 0) / item.totalPages) * 100)}%` }}
            />
          </div>
        )}
      </div>
    </motion.div>
  );
};

const ItemModal = ({ isOpen, onClose, onSave, initialData, existingAuthors = [] }: { 
  isOpen: boolean; 
  onClose: () => void; 
  onSave: (data: any) => void;
  initialData?: LibraryItem | null;
  existingAuthors?: string[];
}) => {
  const [formData, setFormData] = useState({
    title: '',
    author: '',
    category: 'book' as Category,
    status: 'unread' as Status,
    genre: '',
    price: '' as string | number,
    isbn: '',
    totalVolumes: '',
    system: '',
    totalPages: '' as string | number,
    pagesRead: '' as string | number,
    coverUrl: '',
    isWishlist: false,
    seriesName: '',
    loanedTo: '',
    loanDate: null as any
  });

  const [coverResults, setCoverResults] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  useEffect(() => {
    if (initialData) {
      setFormData({
        title: initialData.title || '',
        author: initialData.author || '',
        category: initialData.category || 'book',
        status: initialData.status || 'unread',
        genre: initialData.genre || '',
        price: initialData.price ?? '',
        isbn: initialData.isbn || '',
        totalVolumes: initialData.totalVolumes || '',
        system: initialData.system || '',
        totalPages: initialData.totalPages ?? '',
        pagesRead: initialData.pagesRead ?? '',
        coverUrl: initialData.coverUrl || '',
        isWishlist: initialData.isWishlist || false,
        seriesName: initialData.seriesName || '',
        loanedTo: initialData.loanedTo || '',
        loanDate: initialData.loanDate || null
      });
    } else {
      setFormData({
        title: '',
        author: '',
        category: 'book',
        status: 'unread',
        genre: '',
        price: '',
        isbn: '',
        totalVolumes: '',
        system: '',
        totalPages: '',
        pagesRead: '',
        coverUrl: '',
        isWishlist: false,
        seriesName: '',
        loanedTo: '',
        loanDate: null
      });
    }
  }, [initialData, isOpen]);

  const fetchMetadata = async (isbn: string) => {
    try {
      setIsSearching(true);
      const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
      const data = await res.json();
      if (data.items && data.items.length > 0) {
        const info = data.items[0].volumeInfo;
        setFormData(prev => ({
          ...prev,
          title: info.title || prev.title,
          author: info.authors ? info.authors.join(', ') : prev.author,
          totalPages: info.pageCount || prev.totalPages,
          coverUrl: info.imageLinks ? info.imageLinks.thumbnail.replace('http:', 'https:') : prev.coverUrl,
          isbn: isbn
        }));
      }
    } catch (error) {
      console.error("Metadata fetch failed:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const searchCovers = async () => {
    if (!formData.title) return;
    setIsSearching(true);
    try {
      // @ts-ignore
      const apiKey = import.meta.env.VITE_GOOGLE_SEARCH_API_KEY;
      // @ts-ignore
      const cx = import.meta.env.VITE_GOOGLE_SEARCH_CX;
      
      if (!apiKey || !cx) {
        // Fallback to Google Books if keys are missing
        const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(formData.title)}&maxResults=6`);
        const data = await response.json();
        const covers = data.items
          ?.map((item: any) => item.volumeInfo.imageLinks?.thumbnail)
          .filter(Boolean)
          .map((url: string) => url.replace('http:', 'https:')) || [];
        setCoverResults(covers);
        return;
      }

      const response = await fetch(
        `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(formData.title + ' book cover')}&searchType=image&num=6`
      );
      const data = await response.json();
      const covers = data.items?.map((item: any) => item.link) || [];
      setCoverResults(covers);
    } catch (error) {
      console.error("Cover search failed:", error);
    } finally {
      setIsSearching(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/90 backdrop-blur-md">
      <motion.div 
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        className="bg-zinc-900 border border-white/10 w-full max-w-lg rounded-t-[2rem] sm:rounded-[2rem] p-6 space-y-5 max-h-[90vh] overflow-y-auto no-scrollbar shadow-2xl"
      >
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-serif font-bold text-white">
            {initialData ? 'Edit Treasure' : 'New Treasure'}
          </h2>
          <div className="flex items-center space-x-2">
            <button 
              onClick={() => setShowScanner(true)}
              className="p-2 bg-white/5 border border-white/10 rounded-xl text-zinc-400 hover:text-white transition-all"
              title="Scan ISBN"
            >
              <Scan className="w-5 h-5" />
            </button>
            <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {showScanner && <ISBNScanner onScan={fetchMetadata} onClose={() => setShowScanner(false)} />}

        <div className="space-y-4">
          <div className="flex space-x-4">
            <div className="w-20 h-28 flex-shrink-0 bg-zinc-800/50 rounded-xl overflow-hidden border border-white/10">
              {formData.coverUrl ? (
                <img src={formData.coverUrl} className="w-full h-full object-contain" alt="Preview" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-700">
                  <Book className="w-6 h-6" />
                </div>
              )}
            </div>
            <div className="flex-1 space-y-2">
              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold">Title</label>
                <input 
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-sm text-white focus:outline-none focus:border-white/20 placeholder:text-zinc-600"
                  placeholder="Title..."
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                />
              </div>
              <button 
                onClick={searchCovers}
                disabled={!formData.title || isSearching}
                className="text-[10px] font-bold text-blue-400 hover:text-blue-300 transition-colors flex items-center space-x-1"
              >
                <Search className="w-3 h-3" />
                <span>{isSearching ? 'Searching...' : 'Search Covers'}</span>
              </button>
            </div>
          </div>

          {coverResults.length > 0 && (
            <div className="space-y-2">
              <label className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold">Select Cover</label>
              <div className="cover-grid">
                {coverResults.map((url, i) => (
                  <button 
                    key={i}
                    onClick={() => {
                      setFormData({ ...formData, coverUrl: url });
                      setCoverResults([]);
                    }}
                    className="aspect-cover rounded-lg overflow-hidden border-2 border-transparent hover:border-blue-500 transition-all"
                  >
                    <img src={url} className="w-full h-full object-cover" alt="Result" referrerPolicy="no-referrer" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold">Series Name (Optional)</label>
            <input 
              className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-sm text-white focus:outline-none focus:border-white/20 placeholder:text-zinc-600"
              placeholder="e.g. One Piece, Harry Potter..."
              value={formData.seriesName}
              onChange={e => setFormData({ ...formData, seriesName: e.target.value })}
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
            <div className="flex items-center space-x-3">
              <Heart className={cn("w-5 h-5", formData.isWishlist ? "text-red-500 fill-red-500" : "text-zinc-600")} />
              <div>
                <p className="text-xs font-bold text-white">Add to Wishlist</p>
                <p className="text-[10px] text-zinc-500">Items you want to buy later</p>
              </div>
            </div>
            <button 
              onClick={() => setFormData({ ...formData, isWishlist: !formData.isWishlist })}
              className={cn(
                "w-10 h-5 rounded-full transition-all relative",
                formData.isWishlist ? "bg-red-600" : "bg-zinc-700"
              )}
            >
              <div className={cn(
                "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                formData.isWishlist ? "left-6" : "left-1"
              )} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold">Pages Read</label>
              <input 
                type="number"
                className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-sm text-white focus:outline-none focus:border-white/20 placeholder:text-zinc-600"
                placeholder="0"
                value={formData.pagesRead}
                onChange={e => setFormData({ ...formData, pagesRead: e.target.value === '' ? '' : parseInt(e.target.value) })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold">Total Pages</label>
              <input 
                type="number"
                className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-sm text-white focus:outline-none focus:border-white/20 placeholder:text-zinc-600"
                placeholder="0"
                value={formData.totalPages}
                onChange={e => setFormData({ ...formData, totalPages: e.target.value === '' ? '' : parseInt(e.target.value) })}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold">Purchase Cost (€)</label>
            <input 
              type="number"
              step="0.01"
              className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-sm text-white focus:outline-none focus:border-white/20 placeholder:text-zinc-600"
              placeholder="0.00"
              value={formData.price}
              onChange={e => setFormData({ ...formData, price: e.target.value === '' ? '' : parseFloat(e.target.value) })}
            />
          </div>

          <div className="space-y-2">
            <label className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold">Status</label>
            <div className="flex gap-2">
              {[
                { id: 'unread', label: 'To Read' },
                { id: 'reading', label: 'Reading' },
                { id: 'read', label: 'Finished' }
              ].map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setFormData({ ...formData, status: s.id as Status })}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest border transition-all",
                    formData.status === s.id 
                      ? "bg-white text-black border-white" 
                      : "bg-white/5 border-white/5 text-zinc-500 hover:bg-white/10"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold">Cover URL (Manual Fallback)</label>
            <input 
              className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-sm text-white focus:outline-none focus:border-white/20 placeholder:text-zinc-600"
              placeholder="Paste image URL here..."
              value={formData.coverUrl}
              onChange={e => setFormData({ ...formData, coverUrl: e.target.value })}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold">Author / Publisher</label>
            <div className="relative">
              <input 
                className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-sm text-white focus:outline-none focus:border-white/20"
                placeholder="Author..."
                list="authors-list"
                value={formData.author}
                onChange={e => setFormData({ ...formData, author: e.target.value })}
              />
              <datalist id="authors-list">
                {Array.from(new Set(existingAuthors)).sort().map(author => (
                  <option key={author} value={author} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(['book', 'manga', 'gdr'] as Category[]).map(cat => (
              <button
                key={cat}
                onClick={() => setFormData({ ...formData, category: cat })}
                className={cn(
                  "p-2.5 rounded-xl border transition-all text-[9px] font-bold uppercase tracking-widest",
                  formData.category === cat 
                    ? (cat === 'gdr' ? 'bg-red-900/40 border-red-700 text-red-400' : cat === 'manga' ? 'bg-purple-900/40 border-purple-700 text-purple-400' : 'bg-amber-900/40 border-amber-700 text-amber-400')
                    : "bg-white/5 border-white/10 text-zinc-500"
                )}
              >
                {cat === 'gdr' ? 'RPG' : cat}
              </button>
            ))}
          </div>

          {/* Conditional Fields */}
          <AnimatePresence mode="wait">
            {formData.category === 'book' && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Select Genre</label>
                  <div className="grid grid-cols-2 gap-2">
                    {["Horror", "Poetry", "Cookbook", "Novel", "Thriller", "Fantasy", "Sci-Fi", "Biography", "History", "Other"].map(g => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setFormData({ ...formData, genre: g })}
                        className={cn(
                          "px-3 py-2 rounded-xl text-xs font-medium border transition-all text-left",
                          formData.genre === g 
                            ? "bg-white text-black border-white" 
                            : "bg-white/5 border-white/5 text-zinc-400 hover:bg-white/10"
                        )}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">ISBN</label>
                  <input 
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-white/20"
                    placeholder="ISBN-13..."
                    value={formData.isbn}
                    onChange={e => setFormData({ ...formData, isbn: e.target.value })}
                  />
                </div>
              </motion.div>
            )}
            {formData.category === 'manga' && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Volume Number</label>
                <input 
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-white/20"
                  placeholder="e.g. 1"
                  value={formData.totalVolumes}
                  onChange={e => setFormData({ ...formData, totalVolumes: e.target.value })}
                />
              </motion.div>
            )}
            {formData.category === 'gdr' && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Edition / System</label>
                <input 
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-white/20"
                  placeholder="D&D 5e, Pathfinder 2e, Cyberpunk RED..."
                  value={formData.system}
                  onChange={e => setFormData({ ...formData, system: e.target.value })}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button 
          disabled={!formData.title}
          onClick={() => {
            onSave(formData);
            onClose();
          }}
          className="w-full py-4 bg-white text-black font-bold rounded-2xl hover:bg-zinc-200 transition-all disabled:opacity-50"
        >
          {initialData ? 'Update Collection' : 'Add to Collection'}
        </button>
      </motion.div>
    </div>
  );
};

const Dashboard = ({ items }: { items: LibraryItem[] }) => {
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [visibleCharts, setVisibleCharts] = useState({
    distribution: true,
    value: true
  });

  const filteredItems = useMemo(() => {
    const collectionOnly = items.filter(i => !i.isWishlist);
    return filter === 'all' ? collectionOnly : collectionOnly.filter(i => i.category === filter);
  }, [items, filter]);

  const stats = useMemo(() => {
    const total = filteredItems.length;
    const read = filteredItems.filter(i => i.status === 'read').length;
    const reading = filteredItems.filter(i => i.status === 'reading').length;
    const unread = filteredItems.filter(i => i.status === 'unread').length;
    
    const value = filteredItems.reduce((acc, curr) => acc + (curr.price || 0), 0);
    const avgPrice = total > 0 ? value / total : 0;
    
    const totalPages = filteredItems.reduce((acc, curr) => acc + (Number(curr.totalPages) || 0), 0);
    const pagesRead = filteredItems.reduce((acc, curr) => acc + (Number(curr.pagesRead) || 0), 0);
    const progressPercent = totalPages > 0 ? (pagesRead / totalPages) * 100 : 0;
    
    const mangaCount = filteredItems.filter(i => i.category === 'manga').length;
    
    return { total, read, reading, unread, value, avgPrice, totalPages, pagesRead, progressPercent, mangaCount };
  }, [filteredItems]);

  const genreData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredItems.forEach(item => {
      if (item.genre) {
        counts[item.genre] = (counts[item.genre] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [filteredItems]);

  const statusData = useMemo(() => {
    return [
      { name: 'To Read', value: stats.unread, color: '#71717a' },
      { name: 'Reading', value: stats.reading, color: '#60a5fa' },
      { name: 'Finished', value: stats.read, color: '#22c55e' }
    ];
  }, [stats]);

  const categoryData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredItems.forEach(item => {
      const label = item.category === 'book' ? 'Books' : item.category === 'manga' ? 'Manga' : 'RPG';
      counts[label] = (counts[label] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredItems]);

  const valueData = useMemo(() => {
    const values: Record<string, number> = {};
    filteredItems.forEach(item => {
      const label = item.category === 'book' ? 'Books' : item.category === 'manga' ? 'Manga' : 'RPG';
      values[label] = (values[label] || 0) + (item.price || 0);
    });
    return Object.entries(values).map(([name, value]) => ({ name, value }));
  }, [filteredItems]);

  const COLORS = ['#b45309', '#7e22ce', '#9b1c1c'];

  return (
    <div className="space-y-8 p-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-3xl font-serif font-bold text-white">Dashboard</h2>
        <div className="flex items-center space-x-3">
          <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
            {[
              { id: 'all', label: 'All' },
              { id: 'book', label: 'Books' },
              { id: 'manga', label: 'Manga' },
              { id: 'gdr', label: 'RPG' }
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id as any)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
                  filter === f.id ? "bg-white text-black" : "text-zinc-500 hover:text-white"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="relative group">
            <button className="p-2 bg-white/5 border border-white/10 rounded-xl text-zinc-400 hover:text-white transition-all">
              <Filter className="w-5 h-5" />
            </button>
            <div className="absolute right-0 mt-2 w-48 bg-zinc-900 border border-white/10 rounded-2xl p-4 shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all z-50">
              <p className="text-[10px] uppercase font-bold text-zinc-500 mb-3 tracking-widest">Toggle Charts</p>
              <label className="flex items-center space-x-3 cursor-pointer mb-2">
                <input type="checkbox" checked={visibleCharts.distribution} onChange={e => setVisibleCharts({...visibleCharts, distribution: e.target.checked})} className="accent-amber-600" />
                <span className="text-xs text-zinc-300">Distribution</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer">
                <input type="checkbox" checked={visibleCharts.value} onChange={e => setVisibleCharts({...visibleCharts, value: e.target.checked})} className="accent-amber-600" />
                <span className="text-xs text-zinc-300">Economic Value</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="glass-card p-5 rounded-3xl border-l-4 border-amber-600">
          <p className="text-[9px] uppercase font-bold text-zinc-500 tracking-widest mb-1">Total Items</p>
          <p className="text-3xl font-serif font-bold text-white">{stats.total}</p>
        </div>
        <div className="glass-card p-5 rounded-3xl border-l-4 border-green-600">
          <p className="text-[9px] uppercase font-bold text-zinc-500 tracking-widest mb-1">Finished</p>
          <p className="text-3xl font-serif font-bold text-white">{stats.read}</p>
        </div>
        <div className="glass-card p-5 rounded-3xl border-l-4 border-blue-600">
          <p className="text-[9px] uppercase font-bold text-zinc-500 tracking-widest mb-1">Total Value</p>
          <p className="text-3xl font-serif font-bold text-white">€{stats.value.toFixed(2)}</p>
        </div>
        <div className="glass-card p-5 rounded-3xl border-l-4 border-purple-600">
          <p className="text-[9px] uppercase font-bold text-zinc-500 tracking-widest mb-1">Avg. Price</p>
          <p className="text-3xl font-serif font-bold text-white">€{stats.avgPrice.toFixed(2)}</p>
        </div>
      </div>

      {/* Reading Progress & Manga Count */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="glass-card p-6 rounded-3xl space-y-4">
          <div className="flex justify-between items-end">
            <div>
              <p className="text-[9px] uppercase font-bold text-zinc-500 tracking-widest mb-1">Reading Progress</p>
              <p className="text-2xl font-serif font-bold text-white">{stats.pagesRead.toLocaleString()} <span className="text-sm text-zinc-500 font-sans">/ {stats.totalPages.toLocaleString()} pages</span></p>
            </div>
            <p className="text-2xl font-mono font-bold text-white">{Math.round(stats.progressPercent)}%</p>
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
            <p className="text-[9px] uppercase font-bold text-zinc-500 tracking-widest mb-1">Manga Collected</p>
            <p className="text-4xl font-serif font-bold text-white">{stats.mangaCount}</p>
          </div>
          <div className="p-4 bg-purple-900/20 rounded-2xl">
            <Sparkles className="w-8 h-8 text-purple-500" />
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {visibleCharts.distribution && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6 rounded-3xl h-[350px] flex flex-col">
            <h3 className="text-[10px] font-bold text-zinc-500 mb-6 uppercase tracking-widest">Category Distribution</h3>
            <div className="flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {categoryData.map((entry) => (
                      <Cell key={`cell-category-${entry.name}`} fill={COLORS[categoryData.indexOf(entry) % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                    itemStyle={{ color: '#fff' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6 rounded-3xl h-[350px] flex flex-col">
          <h3 className="text-[10px] font-bold text-zinc-500 mb-6 uppercase tracking-widest">Status Breakdown</h3>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusData} layout="vertical">
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} width={70} />
                <Tooltip 
                  cursor={{ fill: 'transparent' }}
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {statusData.map((entry) => (
                    <Cell key={`cell-status-${entry.name}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {visibleCharts.value && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6 rounded-3xl h-[350px] flex flex-col">
            <h3 className="text-[10px] font-bold text-zinc-500 mb-6 uppercase tracking-widest">Value by Category</h3>
            <div className="flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={valueData}>
                  <XAxis dataKey="name" stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip 
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                  />
                  <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6 rounded-3xl h-[350px] flex flex-col lg:col-span-2">
          <h3 className="text-[10px] font-bold text-zinc-500 mb-6 uppercase tracking-widest">Top Genres</h3>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={genreData}>
                <XAxis dataKey="name" stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip 
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                />
                <Bar dataKey="value" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6 rounded-3xl h-[350px] flex flex-col overflow-hidden">
          <h3 className="text-[10px] font-bold text-zinc-500 mb-4 uppercase tracking-widest">Currently Reading</h3>
          <div className="flex-1 overflow-y-auto no-scrollbar space-y-3">
            {items.filter(i => i.status === 'reading').length > 0 ? (
              items.filter(i => i.status === 'reading').map(item => (
                <div key={item.id} className="flex items-center space-x-3 p-2 bg-white/5 rounded-xl border border-white/5">
                  <div className="w-10 h-14 bg-zinc-800 rounded overflow-hidden flex-shrink-0">
                    {item.coverUrl && <img src={item.coverUrl} className="w-full h-full object-cover" alt="" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-white truncate">{item.title}</p>
                    <p className="text-[10px] text-zinc-500 truncate">{item.author}</p>
                    <div className="mt-1 w-full bg-white/10 h-1 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500" 
                        style={{ width: `${item.totalPages ? (Number(item.pagesRead) / Number(item.totalPages)) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-zinc-600 text-center py-10 italic">Nothing on the desk right now.</p>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

const DetailsModal = ({ item, isOpen, onClose, onUpdateStatus, onUpdatePages, onUpdateLoan, onEdit, onDelete }: {
  item: LibraryItem | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateStatus: (id: string, status: Status) => void;
  onUpdatePages: (id: string, pagesRead: number) => void;
  onUpdateLoan: (id: string, loanedTo: string, loanDate: Date | null) => void;
  onEdit: (item: LibraryItem) => void;
  onDelete: (id: string) => void;
}) => {
  if (!item || !isOpen) return null;

  const categoryConfig = {
    book: { icon: Book, color: 'text-amber-600', label: 'Classic' },
    manga: { icon: Sparkles, color: 'text-purple-600', label: 'Manga' },
    gdr: { icon: Sword, color: 'text-red-700', label: 'RPG' }
  };

  const statusConfig = {
    unread: { icon: Clock, label: 'To Read', color: 'text-zinc-500' },
    reading: { icon: BookOpen, label: 'Reading', color: 'text-blue-400' },
    read: { icon: CheckCircle2, label: 'Finished', color: 'text-green-500' }
  };

  const config = categoryConfig[item.category];
  const status = statusConfig[item.status];
  const Icon = config.icon;
  const progress = item.totalPages ? Math.min(100, ((item.pagesRead || 0) / item.totalPages) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/90 backdrop-blur-md">
      <motion.div 
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        className="bg-zinc-900 border border-white/10 w-full max-w-lg rounded-t-[2rem] sm:rounded-[2rem] p-6 space-y-5 max-h-[90vh] overflow-y-auto no-scrollbar shadow-2xl"
      >
        <div className="flex justify-between items-start">
          <div className="space-y-0.5">
            <span className={cn("text-[9px] uppercase tracking-widest font-bold", config.color)}>{config.label}</span>
            <h2 className="text-xl font-serif font-bold text-white leading-tight">{item.title}</h2>
            <p className="text-sm text-zinc-400">{item.author}</p>
          </div>
          <div className="flex items-center space-x-2">
            <button 
              onClick={() => {
                onEdit(item);
                onClose();
              }} 
              className="p-2 text-zinc-500 hover:text-white transition-all"
            >
              <Pencil className="w-5 h-5" />
            </button>
            <button 
              onClick={() => {
                onDelete(item.id);
                onClose();
              }} 
              className="p-2 text-zinc-500 hover:text-red-500 transition-all"
            >
              <Trash2 className="w-5 h-5" />
            </button>
            <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="flex space-x-5">
          <div className="w-24 h-36 flex-shrink-0 bg-zinc-800/50 rounded-xl overflow-hidden border border-white/10 shadow-lg">
            {item.coverUrl ? (
              <img src={item.coverUrl} className="w-full h-full object-contain" alt={item.title} referrerPolicy="no-referrer" />
            ) : (
              <div className={cn("w-full h-full flex items-center justify-center", config.color)}>
                <Icon className="w-10 h-10 opacity-20" />
              </div>
            )}
          </div>
          <div className="flex-1 space-y-4">
            <div className="space-y-2">
              <label className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold">Status</label>
              <div className="flex flex-wrap gap-1.5">
                {(['unread', 'reading', 'read'] as Status[]).map(s => (
                  <button
                    key={s}
                    onClick={() => onUpdateStatus(item.id, s)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-widest border transition-all",
                      item.status === s ? "bg-white text-black border-white" : "bg-white/5 text-zinc-500 border-white/5 hover:bg-white/10"
                    )}
                  >
                    {statusConfig[s].label}
                  </button>
                ))}
              </div>
            </div>

            {item.price !== undefined && (
              <div className="space-y-0.5">
                <label className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold">Value</label>
                <p className="text-lg font-mono text-white">€{item.price.toFixed(2)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Progress Section */}
        <div className="glass-card p-5 rounded-3xl space-y-3">
          <div className="flex justify-between items-center">
            <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Reading Progress</label>
            <p className="text-xs font-mono text-zinc-400">
              <span className="text-white font-bold">{item.pagesRead || 0}</span> / {item.totalPages || '?'} <span className="ml-1 text-[10px] opacity-50">({Math.round(progress)}%)</span>
            </p>
          </div>
          
          <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              className="h-full bg-white transition-all" 
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button 
              onClick={() => onUpdatePages(item.id, Math.max(0, (item.pagesRead || 0) - 10))}
              className="w-8 h-8 flex items-center justify-center bg-white/5 rounded-lg text-xs text-white hover:bg-white/10 active:scale-90 transition-all shrink-0"
            >
              -10
            </button>
            <input 
              type="range"
              min="0"
              max={item.totalPages || 1000}
              value={item.pagesRead || 0}
              onChange={(e) => onUpdatePages(item.id, parseInt(e.target.value))}
              className="flex-1 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-white"
            />
            <button 
              onClick={() => onUpdatePages(item.id, Math.min(item.totalPages || 1000, (item.pagesRead || 0) + 10))}
              className="w-8 h-8 flex items-center justify-center bg-white/5 rounded-lg text-xs text-white hover:bg-white/10 active:scale-90 transition-all shrink-0"
            >
              +10
            </button>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-3">
          {item.genre && (
            <div className="bg-white/5 p-3 rounded-xl border border-white/5">
              <label className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold block mb-0.5">Genre</label>
              <p className="text-white text-xs">{item.genre}</p>
            </div>
          )}
          {item.isbn && (
            <div className="bg-white/5 p-3 rounded-xl border border-white/5">
              <label className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold block mb-0.5">ISBN</label>
              <p className="text-white text-xs font-mono">{item.isbn}</p>
            </div>
          )}
          {item.totalVolumes && (
            <div className="bg-white/5 p-3 rounded-xl border border-white/5">
              <label className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold block mb-0.5">Volume</label>
              <p className="text-white text-xs">{item.totalVolumes}</p>
            </div>
          )}
          {item.system && (
            <div className="bg-white/5 p-3 rounded-xl border border-white/5">
              <label className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold block mb-0.5">System</label>
              <p className="text-white text-xs">{item.system}</p>
            </div>
          )}
          {item.seriesName && (
            <div className="bg-white/5 p-3 rounded-xl border border-white/5">
              <label className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold block mb-0.5">Series</label>
              <p className="text-white text-xs">{item.seriesName}</p>
            </div>
          )}
        </div>

        {/* Loan Section */}
        <div className="glass-card p-5 rounded-3xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Handshake className={cn("w-5 h-5", item.loanedTo ? "text-amber-500" : "text-zinc-600")} />
              <div>
                <p className="text-xs font-bold text-white">Loan Registry</p>
                <p className="text-[10px] text-zinc-500">Track who borrowed this</p>
              </div>
            </div>
            {item.loanedTo && (
              <button 
                onClick={() => onUpdateLoan(item.id, '', null)}
                className="text-[10px] font-bold text-red-500 uppercase tracking-widest hover:underline"
              >
                Return Item
              </button>
            )}
          </div>

          {item.loanedTo ? (
            <div className="p-3 bg-amber-900/10 border border-amber-900/20 rounded-xl">
              <p className="text-xs text-white">Loaned to <span className="font-bold text-amber-500">{item.loanedTo}</span></p>
              <p className="text-[10px] text-zinc-500">Since {item.loanDate?.toDate().toLocaleDateString()}</p>
            </div>
          ) : (
            <div className="flex space-x-2">
              <input 
                id={`loan-input-${item.id}`}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl p-2 text-xs text-white focus:outline-none focus:border-white/20"
                placeholder="Friend's name..."
              />
              <button 
                onClick={() => {
                  const input = document.getElementById(`loan-input-${item.id}`) as HTMLInputElement;
                  if (input.value) onUpdateLoan(item.id, input.value, new Date());
                }}
                className="px-4 bg-white text-black text-[10px] font-bold uppercase tracking-widest rounded-xl hover:bg-zinc-200"
              >
                Loan
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

const DeleteConfirmationModal = ({ isOpen, onConfirm, onCancel }: { 
  isOpen: boolean; 
  onConfirm: () => void; 
  onCancel: () => void;
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-zinc-900 border border-white/10 p-6 rounded-3xl max-w-sm w-full space-y-6 shadow-2xl"
      >
        <div className="space-y-2 text-center">
          <h3 className="text-xl font-bold text-white">Sei sicuro?</h3>
          <p className="text-zinc-400 text-sm">Vuoi davvero eliminare questo elemento dalla tua libreria? L'azione è irreversibile.</p>
        </div>
        <div className="flex space-x-3">
          <button 
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

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<'library' | 'dashboard' | 'wishlist'>('library');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortOption>(() => {
    return (localStorage.getItem('nerdshelf_sort') as SortOption) || 'date';
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LibraryItem | null>(null);
  const [selectedItemDetails, setSelectedItemDetails] = useState<LibraryItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [groupBySeries, setGroupBySeries] = useState(false);

  useEffect(() => {
    localStorage.setItem('nerdshelf_sort', sortBy);
  }, [sortBy]);

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
      return;
    }

    const q = query(
      collection(db, 'libraryItems'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as LibraryItem[];
      setItems(data);
    });

    return unsubscribe;
  }, [user]);

  // Connection test
  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Firebase connection error: check your configuration.");
        }
      }
    };
    testConnection();
  }, []);

  const filteredItems = useMemo(() => {
    let result = items.filter(item => {
      const matchesSearch = item.title.toLowerCase().includes(search.toLowerCase()) || 
                           item.author.toLowerCase().includes(search.toLowerCase()) ||
                           (item.seriesName && item.seriesName.toLowerCase().includes(search.toLowerCase()));
      const matchesFilter = filter === 'all' || item.category === filter;
      const matchesView = view === 'wishlist' ? item.isWishlist : !item.isWishlist;
      return matchesSearch && matchesFilter && matchesView;
    });

    return result.sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      if (sortBy === 'author') return a.author.localeCompare(b.author);
      if (sortBy === 'status') return a.status.localeCompare(b.status);
      return 0;
    });
  }, [items, search, filter, sortBy, view]);

  const groupedItems = useMemo(() => {
    const groups: Record<string, LibraryItem[]> = {};
    const standalone: LibraryItem[] = [];

    filteredItems.forEach(item => {
      if (item.seriesName) {
        if (!groups[item.seriesName]) groups[item.seriesName] = [];
        groups[item.seriesName].push(item);
      } else {
        standalone.push(item);
      }
    });

    return { groups, standalone };
  }, [filteredItems]);

  const handleSaveItem = async (data: any) => {
    if (!user) return;
    
    // Clean optional fields: remove empty strings/nulls to satisfy Firestore rules
    const cleanData = { ...data };
    if (cleanData.price === '' || cleanData.price === null) delete cleanData.price;
    if (cleanData.totalPages === '' || cleanData.totalPages === null) delete cleanData.totalPages;
    if (cleanData.pagesRead === '' || cleanData.pagesRead === null) delete cleanData.pagesRead;
    if (cleanData.genre === '') delete cleanData.genre;
    if (cleanData.isbn === '') delete cleanData.isbn;
    if (cleanData.totalVolumes === '') delete cleanData.totalVolumes;
    if (cleanData.system === '') delete cleanData.system;
    if (cleanData.coverUrl === '') delete cleanData.coverUrl;
    if (cleanData.seriesName === '') delete cleanData.seriesName;
    if (cleanData.loanedTo === '') delete cleanData.loanedTo;
    if (cleanData.loanDate === null) delete cleanData.loanDate;

    try {
      if (editingItem) {
        await updateDoc(doc(db, 'libraryItems', editingItem.id), cleanData);
      } else {
        await addDoc(collection(db, 'libraryItems'), {
          ...cleanData,
          userId: user.uid,
          createdAt: serverTimestamp()
        });
      }
    } catch (error) {
      handleFirestoreError(error, editingItem ? OperationType.UPDATE : OperationType.CREATE, 'libraryItems');
    }
  };

  const handleUpdateStatus = async (id: string, status: Status) => {
    try {
      await updateDoc(doc(db, 'libraryItems', id), { status });
      if (selectedItemDetails?.id === id) {
        setSelectedItemDetails(prev => prev ? { ...prev, status } : null);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `libraryItems/${id}`);
    }
  };

  const handleUpdatePages = async (id: string, pagesRead: number) => {
    try {
      await updateDoc(doc(db, 'libraryItems', id), { pagesRead });
      if (selectedItemDetails?.id === id) {
        setSelectedItemDetails(prev => prev ? { ...prev, pagesRead } : null);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `libraryItems/${id}`);
    }
  };

  const handleUpdateLoan = async (id: string, loanedTo: string, loanDate: Date | null) => {
    try {
      await updateDoc(doc(db, 'libraryItems', id), { loanedTo, loanDate });
      if (selectedItemDetails?.id === id) {
        setSelectedItemDetails(prev => prev ? { ...prev, loanedTo, loanDate } : null);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `libraryItems/${id}`);
    }
  };

  const handleDeleteItem = async (id: string) => {
    setItemToDelete(id);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      await deleteDoc(doc(db, 'libraryItems', itemToDelete));
      setItemToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `libraryItems/${itemToDelete}`);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="w-12 h-12 border-4 border-zinc-800 border-t-white rounded-full animate-spin" />
    </div>
  );

  if (!user) return <AuthScreen />;

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <header className="relative sm:sticky sm:top-0 z-40 bg-black/60 backdrop-blur-xl border-b border-white/5 px-6 py-3">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center justify-between sm:justify-start sm:space-x-8">
              <h1 className="text-xl font-serif font-bold text-white shrink-0">
                Nerd<span className="text-red-700">Shelf</span>
              </h1>
              
              <nav className="hidden sm:flex items-center space-x-1 bg-white/5 p-1 rounded-xl border border-white/5">
                <button 
                  onClick={() => setView('library')}
                  className={cn("px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all", view === 'library' ? "bg-white text-black" : "text-zinc-500 hover:text-white")}
                >
                  Library
                </button>
                <button 
                  onClick={() => setView('dashboard')}
                  className={cn("px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all", view === 'dashboard' ? "bg-white text-black" : "text-zinc-500 hover:text-white")}
                >
                  Stats
                </button>
                <button 
                  onClick={() => setView('wishlist')}
                  className={cn("px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all", view === 'wishlist' ? "bg-white text-black" : "text-zinc-500 hover:text-white")}
                >
                  Wishlist
                </button>
              </nav>

              <div className="sm:hidden flex items-center space-x-2">
                <button 
                  onClick={() => signOut(auth)}
                  className="p-2 text-zinc-500 hover:text-white transition-colors"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>

            {view === 'library' && (
              <div className="flex flex-1 items-center space-x-3 max-w-2xl">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                  <input 
                    className="w-full bg-white/5 border border-white/5 rounded-xl py-2 pl-10 pr-4 text-xs text-white focus:outline-none focus:bg-white/10 transition-all"
                    placeholder="Search library..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                
                <div className="flex items-center space-x-2 shrink-0">
                  <button 
                    onClick={() => setGroupBySeries(!groupBySeries)}
                    className={cn(
                      "p-2 rounded-lg border transition-all",
                      groupBySeries ? "bg-white/10 border-white/20 text-white" : "bg-transparent border-white/5 text-zinc-500 hover:text-white"
                    )}
                    title="Group by Series"
                  >
                    <Layers className="w-4 h-4" />
                  </button>

                  <select 
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value as SortOption)}
                    className="bg-white/5 border border-white/10 text-[9px] uppercase font-bold tracking-widest text-zinc-400 rounded-lg px-2 py-2 focus:outline-none"
                  >
                    <option value="date" className="bg-zinc-900">Newest</option>
                    <option value="title" className="bg-zinc-900">Title</option>
                    <option value="author" className="bg-zinc-900">Author</option>
                    <option value="status" className="bg-zinc-900">Status</option>
                  </select>

                  <button 
                    onClick={() => signOut(auth)}
                    className="hidden sm:block p-2 text-zinc-500 hover:text-white transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {view !== 'library' && (
              <button 
                onClick={() => signOut(auth)}
                className="hidden sm:block p-2 text-zinc-500 hover:text-white transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>

          {view === 'library' && (
            <div className="flex space-x-2 overflow-x-auto no-scrollbar pt-3 border-t border-white/5 mt-3">
              <CategoryChip label="All" active={filter === 'all'} onClick={() => setFilter('all')} colorClass="bg-white text-black" />
              <CategoryChip label="Books" active={filter === 'book'} onClick={() => setFilter('book')} colorClass="btn-book text-white" />
              <CategoryChip label="Manga" active={filter === 'manga'} onClick={() => setFilter('manga')} colorClass="btn-manga text-white" />
              <CategoryChip label="RPG" active={filter === 'gdr'} onClick={() => setFilter('gdr')} colorClass="btn-gdr text-white" />
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto">
        {view === 'dashboard' ? (
          <Dashboard items={items} />
        ) : (
          <div className="p-6 space-y-10">
            <AnimatePresence mode="popLayout">
              {groupBySeries ? (
                <motion.div key="grouped-view" className="space-y-10">
                  {/* Series Groups */}
                  {Object.entries(groupedItems.groups).map(([seriesName, seriesItems]) => {
                    const items = seriesItems as LibraryItem[];
                    return (
                      <div key={`series-${seriesName}`} className="space-y-4">
                        <div className="flex items-center space-x-3">
                          <div className="p-2 bg-white/5 rounded-lg border border-white/10">
                            <Layers className="w-4 h-4 text-zinc-400" />
                          </div>
                          <h2 className="text-lg font-serif font-bold text-white">{seriesName}</h2>
                          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{items.length} items</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                          {items.map(item => (
                            <ItemCard 
                              key={item.id} 
                              item={item} 
                              onOpenDetails={(item) => setSelectedItemDetails(item)}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {/* Standalone Items */}
                  {groupedItems.standalone.length > 0 && (
                    <div key="standalone-group" className="space-y-4">
                      {Object.keys(groupedItems.groups).length > 0 && (
                        <div className="flex items-center space-x-3">
                          <div className="p-2 bg-white/5 rounded-lg border border-white/10">
                            <Book className="w-4 h-4 text-zinc-400" />
                          </div>
                          <h2 className="text-lg font-serif font-bold text-white">Single Volumes</h2>
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                        {groupedItems.standalone.map(item => (
                          <ItemCard 
                            key={item.id} 
                            item={item} 
                            onOpenDetails={(item) => setSelectedItemDetails(item)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div 
                  key="flat-view"
                  className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6"
                >
                  {filteredItems.map(item => (
                    <ItemCard 
                      key={item.id} 
                      item={item} 
                      onOpenDetails={(item) => setSelectedItemDetails(item)}
                    />
                  ))}
                </motion.div>
              )}

              {filteredItems.length === 0 && (
                <motion.div 
                  key="empty-state"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-20 space-y-4"
                >
                  <div className="inline-flex p-6 rounded-full bg-white/5 text-zinc-700">
                    <Filter className="w-12 h-12" />
                  </div>
                  <p className="text-zinc-500 font-light">No treasures found in this section.</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </main>

      {/* Mobile Nav */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-zinc-950 border-t border-white/5 px-6 py-4 flex justify-around items-center z-40">
        <button 
          onClick={() => setView('library')}
          className={cn("flex flex-col items-center space-y-1", view === 'library' ? "text-white" : "text-zinc-600")}
        >
          <Book className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Library</span>
        </button>
        
        <button 
          onClick={() => {
            setEditingItem(null);
            setIsModalOpen(true);
          }}
          className="flex flex-col items-center -mt-8"
        >
          <div className="w-14 h-14 bg-white text-black rounded-full shadow-2xl flex items-center justify-center border-4 border-black">
            <Plus className="w-7 h-7" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest mt-1 text-white">Add</span>
        </button>

        <button 
          onClick={() => setView('dashboard')}
          className={cn("flex flex-col items-center space-y-1", view === 'dashboard' ? "text-white" : "text-zinc-600")}
        >
          <Sparkles className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Stats</span>
        </button>

        <button 
          onClick={() => setView('wishlist')}
          className={cn("flex flex-col items-center space-y-1", view === 'wishlist' ? "text-white" : "text-zinc-600")}
        >
          <Heart className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Wishlist</span>
        </button>
      </div>

      {/* FAB (Desktop Only) */}
      <button 
        onClick={() => {
          setEditingItem(null);
          setIsModalOpen(true);
        }}
        className="hidden sm:flex fixed bottom-8 right-8 w-16 h-16 bg-white text-black rounded-full shadow-2xl items-center justify-center hover:scale-110 active:scale-95 transition-all z-50"
      >
        <Plus className="w-8 h-8" />
      </button>

      <ItemModal 
        isOpen={isModalOpen} 
        onClose={() => {
          setIsModalOpen(false);
          setEditingItem(null);
        }} 
        onSave={handleSaveItem}
        initialData={editingItem}
        existingAuthors={items.map(i => i.author).filter(Boolean)}
      />

      <DeleteConfirmationModal 
        isOpen={!!itemToDelete}
        onConfirm={confirmDelete}
        onCancel={() => setItemToDelete(null)}
      />

      <DetailsModal 
        item={selectedItemDetails}
        isOpen={!!selectedItemDetails}
        onClose={() => setSelectedItemDetails(null)}
        onUpdateStatus={handleUpdateStatus}
        onUpdatePages={handleUpdatePages}
        onUpdateLoan={handleUpdateLoan}
        onEdit={(item) => {
          setEditingItem(item);
          setIsModalOpen(true);
        }}
        onDelete={handleDeleteItem}
      />
    </div>
  );
}
