import * as fs from 'fs';

let code = fs.readFileSync('src/App.tsx', 'utf8');

// The hover:bg-zinc-800 should be back to hover:bg-zinc-200 everywhere, 
// EXCPET if the button background is zinc-900.
code = code.replace(/bg-zinc-900 text-zinc-50 font-semibold rounded-2xl hover:bg-zinc-800/g, 'bg-zinc-900 text-zinc-50 font-semibold rounded-2xl hover:bg-zinc-800'); // keep this one
code = code.replace(/hover:bg-zinc-800/g, 'hover:bg-zinc-200'); // put everything else back to 200
code = code.replace(/bg-zinc-900 text-zinc-50 hover:bg-zinc-200/g, 'bg-zinc-900 text-zinc-50 hover:bg-zinc-800'); // correct the dark buttons

// Re-add ring-zinc-500
code = code.replace(/ring-white/g, 'ring-zinc-900');

fs.writeFileSync('src/App.tsx', code);
