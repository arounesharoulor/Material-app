const https = require('https');
const fs = require('fs');
const path = require('path');

const soundsDir = path.join(__dirname, 'assets', 'sounds');
if (!fs.existsSync(soundsDir)) {
    fs.mkdirSync(soundsDir, { recursive: true });
}

const download = (url, dest) => {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => reject(err));
        });
    });
};

const sounds = [
    { url: 'https://raw.githubusercontent.com/rafaelreis-hotmart/Audio-Samples/master/ding.mp3', dest: 'default.mp3' },
    { url: 'https://raw.githubusercontent.com/rafaelreis-hotmart/Audio-Samples/master/alert.mp3', dest: 'penalty.mp3' },
    { url: 'https://raw.githubusercontent.com/rafaelreis-hotmart/Audio-Samples/master/success.mp3', dest: 'closed.mp3' }
];

async function main() {
    for (const s of sounds) {
        console.log('Downloading', s.dest);
        await download(s.url, path.join(soundsDir, s.dest));
    }
    console.log('Done downloading sounds.');
}

main();
