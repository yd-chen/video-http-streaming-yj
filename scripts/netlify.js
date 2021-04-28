const path = require('path');
const sh = require('shelljs');
const deployDir = 'deploy';

const files = [
  'node_modules/video.js/dist/video-js.css',
  'node_modules/video.js/dist/alt/video.core.js',
  'node_modules/videojs-contrib-eme/dist/videojs-contrib-eme.js',
  'node_modules/videojs-contrib-quality-levels/dist/videojs-contrib-quality-levels.js',
  'node_modules/d3/d3.min.js'
];

// cleanup previous deploy
sh.rm('-rf', deployDir);
// make sure the directory exists
sh.mkdir('-p', deployDir);

// create nested directories for the main files
files
.map((file) => path.dirname(file))
.forEach((dir) => sh.mkdir('-p', path.join(deployDir, dir)));

// copy files/folders to deploy dir
files
.concat('dist', 'index.html', 'index.min.html', 'utils')
.forEach((file) => sh.cp('-r', file, path.join(deployDir, file)));
