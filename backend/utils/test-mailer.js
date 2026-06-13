require('dotenv').config({ path: '../.env' });
const nodemailer = require('nodemailer');

async function test() {
    console.log("Testing with service: 'gmail'");
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });
        const info = await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_USER,
            subject: "Test service gmail",
            text: "Hello world"
        });
        console.log("Success with service: 'gmail', Message ID:", info.messageId);
    } catch (e) {
        console.error("Failed with service: 'gmail':", e.message);
    }

    console.log("\nTesting with host, port 465, secure true");
    try {
        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });
        const info = await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_USER,
            subject: "Test host 465",
            text: "Hello world"
        });
        console.log("Success with host, port 465, Message ID:", info.messageId);
    } catch (e) {
        console.error("Failed with host, port 465:", e.message);
    }
}

test();
