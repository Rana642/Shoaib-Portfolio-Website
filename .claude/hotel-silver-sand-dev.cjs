// Starts the Hotel Silver Sand dev server from its own folder so Next/Tailwind/
// PostCSS resolve that repo's config (not this repo's Tailwind v4 setup).
const path = require('path');
const dir = path.resolve(__dirname, '../../Hotel Silver Sand Multan');
process.chdir(dir);
process.argv = [process.argv[0], path.join(dir, 'node_modules/next/dist/bin/next'), 'dev', '--port', '3030'];
require(process.argv[1]);
