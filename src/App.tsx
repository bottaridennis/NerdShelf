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
  Pencil
} from 'lucide-react';
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
  coverUrl?: string;
  createdAt: any;
}

// --- Components ---

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

const ItemCard = ({ item, onDelete, onUpdateStatus, onEdit }: { 
  item: LibraryItem; 
  onDelete: (id: string) => void;
  onUpdateStatus: (id: string, status: Status) => void;
  onEdit: (item: LibraryItem) => void;
  key?: string;
}) => {
  const categoryConfig = {
    book: { icon: Book, color: 'text-amber-600', border: 'category-book', label: 'Classic' },
    manga: { icon: Sparkles, color: 'text-purple-600', border: 'category-manga', label: 'Manga' },
    gdr: { icon: Sword, color: 'text-red-700', border: 'category-gdr', label: 'RPG' }
  };

  const statusConfig = {
    unread: { icon: Clock, label: 'To Read', color: 'text-zinc-500' },
    reading: { icon: BookOpen, label: 'Reading', color: 'text-blue-400' },
    read: { icon: CheckCircle2, label: 'Finished', color: 'text-green-500' }
  };

  const config = categoryConfig[item.category];
  const status = statusConfig[item.status];
  const Icon = config.icon;
  const StatusIcon = status.icon;

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn("glass-card p-4 rounded-2xl flex items-start space-x-4 group relative overflow-hidden", config.border)}
    >
      <div className="w-20 h-28 flex-shrink-0 bg-white/5 rounded-lg overflow-hidden relative">
        {item.coverUrl ? (
          <img 
            src={item.coverUrl} 
            alt={item.title} 
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className={cn("w-full h-full flex items-center justify-center", config.color)}>
            <Icon className="w-8 h-8 opacity-20" />
          </div>
        )}
      </div>
      
      <div className="flex-1 min-w-0 py-1">
        <div className="flex justify-between items-start">
          <h3 className="text-lg font-medium text-white truncate leading-tight">{item.title}</h3>
          {item.price !== undefined && (
            <span className="text-xs font-mono text-zinc-400 ml-2">€{item.price.toFixed(2)}</span>
          )}
        </div>
        <p className="text-sm text-zinc-500 truncate">{item.author || 'Unknown Author'}</p>
        
        <div className="flex items-center mt-2 space-x-3">
          <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-600">{config.label}</span>
          {item.genre && (
            <>
              <div className="w-1 h-1 rounded-full bg-zinc-800" />
              <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">{item.genre}</span>
            </>
          )}
          <div className="w-1 h-1 rounded-full bg-zinc-800" />
          <button 
            onClick={() => {
              const next: Record<Status, Status> = { unread: 'reading', reading: 'read', read: 'unread' };
              onUpdateStatus(item.id, next[item.status]);
            }}
            className={cn("flex items-center space-x-1 text-xs font-medium", status.color)}
          >
            <StatusIcon className="w-3 h-3" />
            <span>{status.label}</span>
          </button>
        </div>

        {/* Conditional Badges */}
        <div className="flex flex-wrap gap-2 mt-3">
          {item.isbn && <span className="text-[9px] px-2 py-0.5 bg-white/5 rounded-md text-zinc-500 border border-white/5">ISBN: {item.isbn}</span>}
          {item.totalVolumes && <span className="text-[9px] px-2 py-0.5 bg-white/5 rounded-md text-zinc-500 border border-white/5">{item.totalVolumes} Vol.</span>}
          {item.system && <span className="text-[9px] px-2 py-0.5 bg-white/5 rounded-md text-zinc-500 border border-white/5">System: {item.system}</span>}
        </div>
      </div>

      <div className="flex flex-col space-y-2 opacity-0 group-hover:opacity-100 transition-all">
        <button 
          onClick={() => onEdit(item)}
          className="p-2 text-zinc-500 hover:text-white transition-all"
        >
          <Pencil className="w-5 h-5" />
          <span className="sr-only">Edit</span>
        </button>
        <button 
          onClick={() => onDelete(item.id)}
          className="p-2 text-zinc-500 hover:text-red-500 transition-all"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>
    </motion.div>
  );
};

const ItemModal = ({ isOpen, onClose, onSave, initialData }: { 
  isOpen: boolean; 
  onClose: () => void; 
  onSave: (data: any) => void;
  initialData?: LibraryItem | null;
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
    coverUrl: ''
  });

  const [coverResults, setCoverResults] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);

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
        coverUrl: initialData.coverUrl || ''
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
        coverUrl: ''
      });
    }
  }, [initialData, isOpen]);

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
        className="bg-zinc-900 border border-white/10 w-full max-w-lg rounded-t-[2.5rem] sm:rounded-[2.5rem] p-8 space-y-6 max-h-[90vh] overflow-y-auto no-scrollbar shadow-2xl"
      >
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-serif font-bold text-white">
            {initialData ? 'Edit Treasure' : 'New Treasure'}
          </h2>
          <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white"><X /></button>
        </div>

        <div className="space-y-4">
          <div className="flex space-x-4">
            <div className="w-24 h-36 flex-shrink-0 bg-white/5 rounded-xl overflow-hidden border border-white/10">
              {formData.coverUrl ? (
                <img src={formData.coverUrl} className="w-full h-full object-cover" alt="Preview" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-700">
                  <Book className="w-8 h-8" />
                </div>
              )}
            </div>
            <div className="flex-1 space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Title</label>
                <input 
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-white/20 placeholder:text-zinc-600"
                  placeholder="Title..."
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                />
              </div>
              <button 
                onClick={searchCovers}
                disabled={!formData.title || isSearching}
                className="text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors flex items-center space-x-1"
              >
                <Search className="w-3 h-3" />
                <span>{isSearching ? 'Searching...' : 'Search Covers'}</span>
              </button>
            </div>
          </div>

          {coverResults.length > 0 && (
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Select Cover</label>
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Purchase Cost (€)</label>
              <input 
                type="number"
                step="0.01"
                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-white/20 placeholder:text-zinc-600"
                placeholder="0.00"
                value={formData.price}
                onChange={e => setFormData({ ...formData, price: e.target.value === '' ? '' : parseFloat(e.target.value) })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Status</label>
              <select 
                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-white/20"
                value={formData.status}
                onChange={e => setFormData({ ...formData, status: e.target.value as Status })}
              >
                <option value="unread" className="bg-zinc-900">To Read</option>
                <option value="reading" className="bg-zinc-900">Reading</option>
                <option value="read" className="bg-zinc-900">Finished</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Cover URL (Manual Fallback)</label>
            <input 
              className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-white/20 placeholder:text-zinc-600"
              placeholder="Paste image URL here..."
              value={formData.coverUrl}
              onChange={e => setFormData({ ...formData, coverUrl: e.target.value })}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Author / Publisher</label>
            <input 
              className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-white/20"
              placeholder="Author..."
              value={formData.author}
              onChange={e => setFormData({ ...formData, author: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            {(['book', 'manga', 'gdr'] as Category[]).map(cat => (
              <button
                key={cat}
                onClick={() => setFormData({ ...formData, category: cat })}
                className={cn(
                  "p-3 rounded-xl border transition-all text-[10px] font-bold uppercase tracking-widest",
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
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Type / Genre</label>
                  <select 
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-white/20"
                    value={formData.genre}
                    onChange={e => setFormData({ ...formData, genre: e.target.value })}
                  >
                    <option value="">Select Genre...</option>
                    <option value="Horror">Horror</option>
                    <option value="Poetry">Poetry</option>
                    <option value="Cookbook">Cookbook</option>
                    <option value="Novel">Novel</option>
                    <option value="Thriller">Thriller</option>
                    <option value="Fantasy">Fantasy</option>
                    <option value="Sci-Fi">Sci-Fi</option>
                    <option value="Biography">Biography</option>
                    <option value="History">History</option>
                    <option value="Other">Other</option>
                  </select>
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
                <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Total Volumes</label>
                <input 
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-white/20"
                  placeholder="e.g. 42"
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
    return filter === 'all' ? items : items.filter(i => i.category === filter);
  }, [items, filter]);

  const stats = useMemo(() => {
    const total = filteredItems.length;
    const read = filteredItems.filter(i => i.status === 'read').length;
    const value = filteredItems.reduce((acc, curr) => acc + (curr.price || 0), 0);
    return { total, read, value };
  }, [filteredItems]);

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
          <select 
            value={filter}
            onChange={e => setFilter(e.target.value as any)}
            className="bg-white/5 border border-white/10 text-xs font-bold uppercase tracking-widest text-zinc-400 rounded-xl px-4 py-2 focus:outline-none"
          >
            <option value="all" className="bg-zinc-900">All Categories</option>
            <option value="book" className="bg-zinc-900">Books Only</option>
            <option value="manga" className="bg-zinc-900">Manga Only</option>
            <option value="gdr" className="bg-zinc-900">RPG Only</option>
          </select>
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card p-6 rounded-3xl border-l-4 border-amber-600">
          <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest mb-1">Total Items</p>
          <p className="text-4xl font-serif font-bold text-white">{stats.total}</p>
        </div>
        <div className="glass-card p-6 rounded-3xl border-l-4 border-green-600">
          <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest mb-1">Finished</p>
          <p className="text-4xl font-serif font-bold text-white">{stats.read}</p>
        </div>
        <div className="glass-card p-6 rounded-3xl border-l-4 border-blue-600">
          <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest mb-1">Total Value</p>
          <p className="text-4xl font-serif font-bold text-white">€{stats.value.toFixed(2)}</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {visibleCharts.distribution && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6 rounded-3xl h-[400px] flex flex-col">
            <h3 className="text-sm font-bold text-zinc-400 mb-6 uppercase tracking-widest">Category Distribution</h3>
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
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        )}

        {visibleCharts.value && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6 rounded-3xl h-[400px] flex flex-col">
            <h3 className="text-sm font-bold text-zinc-400 mb-6 uppercase tracking-widest">Value by Category (€)</h3>
            <div className="flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={valueData}>
                  <XAxis dataKey="name" stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip 
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                    {valueData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<'library' | 'dashboard'>('library');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortOption>(() => {
    return (localStorage.getItem('nerdshelf_sort') as SortOption) || 'date';
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LibraryItem | null>(null);

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
                           item.author.toLowerCase().includes(search.toLowerCase());
      const matchesFilter = filter === 'all' || item.category === filter;
      return matchesSearch && matchesFilter;
    });

    return result.sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      if (sortBy === 'author') return a.author.localeCompare(b.author);
      if (sortBy === 'status') return a.status.localeCompare(b.status);
      return 0; // Default to Firestore's desc order
    });
  }, [items, search, filter, sortBy]);

  const handleSaveItem = async (data: any) => {
    if (!user) return;
    try {
      if (editingItem) {
        await updateDoc(doc(db, 'libraryItems', editingItem.id), data);
      } else {
        await addDoc(collection(db, 'libraryItems'), {
          ...data,
          userId: user.uid,
          createdAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error("Error saving item:", error);
    }
  };

  const handleUpdateStatus = async (id: string, status: Status) => {
    try {
      await updateDoc(doc(db, 'libraryItems', id), { status });
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm("Are you sure you want to remove this from your library?")) return;
    try {
      await deleteDoc(doc(db, 'libraryItems', id));
    } catch (error) {
      console.error("Error deleting item:", error);
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
      <header className="sticky top-0 z-40 bg-black/60 backdrop-blur-xl border-b border-white/5 px-6 py-4">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-serif font-bold text-white">
              Nerd<span className="text-red-700">Shelf</span>
            </h1>
            <div className="flex items-center space-x-4">
              <nav className="hidden sm:flex items-center space-x-1 bg-white/5 p-1 rounded-xl border border-white/5">
                <button 
                  onClick={() => setView('library')}
                  className={cn("px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all", view === 'library' ? "bg-white text-black" : "text-zinc-500 hover:text-white")}
                >
                  Library
                </button>
                <button 
                  onClick={() => setView('dashboard')}
                  className={cn("px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all", view === 'dashboard' ? "bg-white text-black" : "text-zinc-500 hover:text-white")}
                >
                  Stats
                </button>
              </nav>
              <div className="flex items-center space-x-2">
                {view === 'library' && (
                  <select 
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value as SortOption)}
                    className="bg-white/5 border border-white/10 text-[10px] uppercase font-bold tracking-widest text-zinc-400 rounded-lg px-2 py-1 focus:outline-none"
                  >
                    <option value="date" className="bg-zinc-900">Newest</option>
                    <option value="title" className="bg-zinc-900">Title</option>
                    <option value="author" className="bg-zinc-900">Author</option>
                    <option value="status" className="bg-zinc-900">Status</option>
                  </select>
                )}
                <button 
                  onClick={() => signOut(auth)}
                  className="p-2 text-zinc-500 hover:text-white transition-colors"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {view === 'library' && (
            <>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input 
                  className="w-full bg-white/5 border border-white/5 rounded-2xl py-3 pl-12 pr-4 text-sm text-white focus:outline-none focus:bg-white/10 transition-all"
                  placeholder="Search your library..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>

              <div className="flex space-x-2 overflow-x-auto no-scrollbar pb-1">
                <CategoryChip label="All" active={filter === 'all'} onClick={() => setFilter('all')} colorClass="bg-white text-black" />
                <CategoryChip label="Books" active={filter === 'book'} onClick={() => setFilter('book')} colorClass="btn-book text-white" />
                <CategoryChip label="Manga" active={filter === 'manga'} onClick={() => setFilter('manga')} colorClass="btn-manga text-white" />
                <CategoryChip label="RPG" active={filter === 'gdr'} onClick={() => setFilter('gdr')} colorClass="btn-gdr text-white" />
              </div>
            </>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto">
        {view === 'library' ? (
          <div className="max-w-2xl mx-auto p-6 space-y-4">
            <AnimatePresence mode="popLayout">
              {filteredItems.length > 0 ? (
                filteredItems.map(item => (
                  <ItemCard 
                    key={item.id} 
                    item={item} 
                    onDelete={handleDeleteItem}
                    onUpdateStatus={handleUpdateStatus}
                    onEdit={(item) => {
                      setEditingItem(item);
                      setIsModalOpen(true);
                    }}
                  />
                ))
              ) : (
                <motion.div 
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
        ) : (
          <Dashboard items={items} />
        )}
      </main>

      {/* Mobile Nav */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-black/80 backdrop-blur-xl border-t border-white/5 px-6 py-4 flex justify-around items-center z-40">
        <button 
          onClick={() => setView('library')}
          className={cn("flex flex-col items-center space-y-1", view === 'library' ? "text-white" : "text-zinc-600")}
        >
          <Book className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Library</span>
        </button>
        <button 
          onClick={() => setView('dashboard')}
          className={cn("flex flex-col items-center space-y-1", view === 'dashboard' ? "text-white" : "text-zinc-600")}
        >
          <Sparkles className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Stats</span>
        </button>
      </div>

      {/* FAB */}
      <button 
        onClick={() => {
          setEditingItem(null);
          setIsModalOpen(true);
        }}
        className="fixed bottom-8 right-8 w-16 h-16 bg-white text-black rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-50"
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
      />
    </div>
  );
}
