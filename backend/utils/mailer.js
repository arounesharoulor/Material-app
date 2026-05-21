require('dotenv').config();
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const EMAIL_USER = (process.env.EMAIL_USER || 'managemadhura123@gmail.com').trim();
const EMAIL_PASS = 'dohzspvemkycjkxj'; // Hardcoded temporarily to bypass old Render environment variable

console.log(`[MAILER] Configured with user: ${EMAIL_USER}, pass length: ${EMAIL_PASS.length}`);

// Create a fresh transporter
const createTransporter = () => {
    return nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false, // Upgrade later with STARTTLS
        requireTLS: true,
        auth: {
            user: EMAIL_USER,
            pass: EMAIL_PASS
        },
        // Force IPv4, Render sometimes has issues with IPv6 to Google
        tls: {
            rejectUnauthorized: false
        },
        // Connection pool settings for reliability
        pool: false,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
    });
};

let transporter = createTransporter();

// Verify connection configuration
transporter.verify((error, success) => {
    if (error) {
        console.error('[MAILER] ❌ Connection FAILED:', error.message);
        console.error('[MAILER] Full error:', JSON.stringify({ code: error.code, command: error.command, response: error.response }));
    } else {
        console.log('[MAILER] ✅ Server is ready to take messages');
    }
});

/**
 * Send a generic email with retry
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} text - Plain text body
 */
const sendEmail = async (to, subject, text) => {
    const mailOptions = {
        from: EMAIL_USER,
        to,
        subject,
        text
    };

    const MAX_RETRIES = 2;
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            console.log(`[MAILER] Attempt ${attempt}/${MAX_RETRIES} — sending to: ${to} (Subject: ${subject})`);
            const info = await transporter.sendMail(mailOptions);
            console.log(`[MAILER] ✅ Email sent to ${to}. MessageId: ${info.messageId}`);

            // Audit log
            try {
                const logContent = `[${new Date().toISOString()}] SUCCESS: Email to ${to}, Subject: ${subject}, MessageId: ${info.messageId}\n`;
                fs.appendFileSync(path.join(__dirname, '../mailer.log'), logContent);
            } catch (_) { /* ignore log write errors */ }

            return info;
        } catch (err) {
            lastError = err;
            console.error(`[MAILER] ❌ Attempt ${attempt} failed:`, err.message);
            console.error(`[MAILER] Error details: code=${err.code}, command=${err.command}, responseCode=${err.responseCode}`);

            // Recreate transporter for retry (fresh connection)
            if (attempt < MAX_RETRIES) {
                console.log('[MAILER] Recreating transporter for retry...');
                transporter = createTransporter();
                await new Promise(r => setTimeout(r, 1000)); // 1s pause before retry
            }
        }
    }

    // All retries failed
    try {
        const logContent = `[${new Date().toISOString()}] FAILED: Email to ${to}, Error: ${lastError.message}\n`;
        fs.appendFileSync(path.join(__dirname, '../mailer.log'), logContent);
    } catch (_) { /* ignore log write errors */ }

    throw lastError;
};

module.exports = { sendEmail, transporter: createTransporter() };
