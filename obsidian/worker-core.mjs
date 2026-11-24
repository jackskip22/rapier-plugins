// The plug-in's worker is its own, so it runs each jpegxl module's core (the exports map's "import" file) right there. The
// "browser" file is a page's front door: inside a worker it imports the core by its URL, and a worker bundled as one
// classic script has no URL to resolve against ("Failed to construct 'URL': Invalid URL" with jpegxl 8.5.0).
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const pkg = join(dirname(fileURLToPath(import.meta.url)), 'node_modules/jpegxl');
export const workerCore = {name: 'worker-core', setup(b) {
  b.onResolve({filter: /^jpegxl\/[\w-]+$/}, ({path}) => {
    const entry = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')).exports['./' + path.split('/')[1]];
    const file = typeof entry === 'string' ? entry : entry?.import ?? entry?.default;
    return file ? {path: join(pkg, file)} : undefined;
  });
}};
