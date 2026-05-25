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
    try {
      fs.renameSync(dist, publicDir);
      console.log('Moved dist -> public');
      process.exit(0);
    } catch (err) {
      console.warn('Rename failed, falling back to recursive copy:', err.message);
      // Fallback: copy files recursively from dist -> public
      const copyRecursive = (src, dest) => {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
          const srcPath = path.join(src, entry.name);
          const destPath = path.join(dest, entry.name);
          if (entry.isDirectory()) {
            copyRecursive(srcPath, destPath);
          } else {
            fs.copyFileSync(srcPath, destPath);
          }
        }
      };

      copyRecursive(dist, publicDir);
      // remove the dist folder afterwards
      try {
        fs.rmSync(dist, { recursive: true, force: true });
      } catch (rmErr) {
        console.warn('Could not remove dist after copy:', rmErr.message);
      }
      // If Expo exported assets into public/assets/assets, flatten to public/assets
      const nestedAssets = path.join(publicDir, 'assets', 'assets');
      const topAssets = path.join(publicDir, 'assets');
      try {
        if (fs.existsSync(nestedAssets)) {
          const entries = fs.readdirSync(nestedAssets);
          for (const e of entries) {
            const s = path.join(nestedAssets, e);
            const d = path.join(topAssets, e);
            // move file or dir
            fs.renameSync(s, d);
          }
          // remove the now-empty nested folder
          fs.rmdirSync(nestedAssets);
          console.log('Flattened nested assets directory');
        }
      } catch (flatErr) {
        console.warn('Could not flatten assets:', flatErr.message);
      }
      console.log('Copied dist -> public (fallback)');
      process.exit(0);
    }
  } else {
    console.error('dist directory not found');
    process.exit(2);
  }
} catch (err) {
  console.error('Error moving dist to public:', err);
  process.exit(1);
}
