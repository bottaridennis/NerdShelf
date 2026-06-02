import * as fs from 'fs';

let code = fs.readFileSync('src/App.tsx', 'utf8');

// Reverse the light mode replacements to get a deep dark theme again
code = code.replace(/text-zinc-900/g, 'text-white');
code = code.replace(/text-zinc-800/g, 'text-zinc-100');
code = code.replace(/bg-zinc-50/g, 'bg-black/40');
code = code.replace(/bg-zinc-100/g, 'bg-white/5');
code = code.replace(/bg-zinc-200/g, 'bg-white/10');
code = code.replace(/bg-zinc-300/g, 'bg-white/20');
code = code.replace(/bg-white(?!\/)/g, 'bg-zinc-900');
code = code.replace(/border-zinc-200/g, 'border-white/10');
code = code.replace(/border-zinc-300/g, 'border-white/20');
code = code.replace(/border-zinc-900/g, 'border-white/30');
code = code.replace(/ring-zinc-900/g, 'ring-white/50');
code = code.replace(/text-zinc-500/g, 'text-zinc-400');
code = code.replace(/text-zinc-400/g, 'text-zinc-500'); // Note: slight toggle artifact, but generally ok in dark mode.

// Ensure primary backgrounds are truly dark, using radial gradients to give it that premium feel.
// Add a cool background behind the main layout.
code = code.replace(/className="min-h-screen bg-black\/40/g, 'className="min-h-screen bg-black bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900 via-black to-black');
code = code.replace(/className="min-h-screen bg-black /g, 'className="min-h-screen bg-black bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900 via-black to-black ');

// Enhance the main card aesthetic
// Find the generic glass card pattern and add the custom glass-card class
code = code.replace(/bg-zinc-900\/80 backdrop-blur-xl border border-white\/10 shadow-2xl/g, 'glass-card');
code = code.replace(/bg-zinc-900 border border-white\/10 shadow-xl/g, 'glass-card');
code = code.replace(/bg-black\/40 rounded-2xl border border-white\/10/g, 'glass-card rounded-2xl p-6');
code = code.replace(/bg-white\/5 rounded-2xl p-6 shadow-sm border border-white\/10/g, 'glass-card rounded-2xl p-6');

// More fixes for buttons that got slightly broken during inversion
code = code.replace(/bg-zinc-900 text-zinc-50/g, 'bg-white text-zinc-900'); 
code = code.replace(/text-zinc-50 /g, 'text-zinc-900 '); 
code = code.replace(/text-zinc-50</g, 'text-zinc-900<');

// Apply explicit modern hover effects to item cards if we can find them
// The cards typically have `className="relative group bg...`
code = code.replace(/className="relative group bg-zinc-900 rounded-2xl/g, 'className="relative group glass-card type-${item.category} rounded-2xl');
code = code.replace(/className="bg-zinc-900 rounded-2xl p-4 md:p-5 flex/g, 'className="glass-card type-${item.category} rounded-2xl p-4 md:p-5 flex');
code = code.replace(/className={`relative group bg-zinc-900/g, 'className={`relative group glass-card type-${item?.category || "book"}');

fs.writeFileSync('src/App.tsx', code);
console.log('App.tsx enhanced and reverted to premium dark mode');
