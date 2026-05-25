const fs = require('fs');
const path = require('path');

const root = __dirname + '/..';
const dist = path.join(root, 'dist');
const publicDir = path.join(root, 'public');

try {
  if (fs.existsSync(publicDir)) {
    fs.rmSync(publicDir, { recursive: true, force: true });
  }
  if (fs.existsSync(dist)) {
    fs.renameSync(dist, publicDir);
    console.log('Moved dist -> public');
    process.exit(0);
  } else {
    console.error('dist directory not found');
    process.exit(2);
  }
} catch (err) {
  console.error('Error moving dist to public:', err);
  process.exit(1);
}
