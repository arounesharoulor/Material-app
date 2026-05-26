const { Jimp } = require('jimp');
const path = require('path');
const fs = require('fs');

const assetsDir = path.join(__dirname, '..', 'assets');
const logoPath = path.join(assetsDir, 'logo.png');

async function generateSquareIcons() {
    try {
        console.log('⏳ Reading logo.png...');
        if (!fs.existsSync(logoPath)) {
            console.error(`❌ logo.png not found at: ${logoPath}`);
            process.exit(1);
        }

        const image = await Jimp.read(logoPath);
        const width = image.bitmap.width;
        const height = image.bitmap.height;
        console.log(`📐 Original dimensions: ${width}x${height}`);

        const squareSize = Math.max(width, height, 1024);
        console.log(`🎯 Creating square container: ${squareSize}x${squareSize}`);

        // Jimp v1 API: create a blank image using fromBitmap or new Jimp with options object
        const squareImg = new Jimp({
            width: squareSize,
            height: squareSize,
            color: 0xffffffff // white background
        });

        // Center the logo inside the square image
        const xOffset = Math.floor((squareSize - width) / 2);
        const yOffset = Math.floor((squareSize - height) / 2);

        squareImg.composite(image, xOffset, yOffset);

        // Save the square version
        const squareLogoPath = path.join(assetsDir, 'logo_square.png');
        await squareImg.write(squareLogoPath);
        console.log('✅ Generated square logo at logo_square.png');

        // Copy to all required Expo icon targets
        const targets = ['icon.png', 'adaptive-icon.png', 'favicon.png', 'splash.png'];
        targets.forEach(target => {
            const dest = path.join(assetsDir, target);
            fs.copyFileSync(squareLogoPath, dest);
            console.log(`➡️  Copied to ${target}`);
        });

        console.log('🎉 All icons generated successfully as square images!');
    } catch (err) {
        console.error('❌ Error generating square icons:', err.message);
        process.exit(1);
    }
}

generateSquareIcons();
