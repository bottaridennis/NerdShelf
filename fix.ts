import * as fs from 'fs';

let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(/hover:bg-zinc-200/g, 'hover:bg-zinc-800');
code = code.replace(/border-red-900\/20/g, 'border-red-200');
code = code.replace(/bg-red-900\/20/g, 'bg-red-50');

fs.writeFileSync('src/App.tsx', code);
