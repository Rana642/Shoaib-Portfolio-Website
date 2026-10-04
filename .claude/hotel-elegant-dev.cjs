// Starts the Hotel Elegant dev server from its own folder so Next/Tailwind/
// PostCSS resolve that repo's config (not this repo's Tailwind v4 setup).
const path = require('path');
const dir = path.resolve(__dirname, '../../Hotel Elegant Multan');
process.chdir(dir);
process.argv = [process.argv[0], path.join(dir, 'node_modules/next/dist/bin/next'), 'dev', '--port', '3020'];
require(process.argv[1]);
