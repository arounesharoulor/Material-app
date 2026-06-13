require('dotenv').config({ path: '../.env' });
const { sendEmail } = require('./mailer');

async function test() {
    try {
        const info = await sendEmail(
            process.env.EMAIL_USER,
            "Test from module",
            "This is a test of the updated mailer.js configuration."
        );
        console.log("Success! Message info:", info);
    } catch (e) {
        console.error("Failed to send email:", e.message);
    }
}

test();
