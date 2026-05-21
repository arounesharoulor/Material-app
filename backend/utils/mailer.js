require('dotenv').config();
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'managemadhura123@gmail.com',
        pass: (process.env.EMAIL_PASS || 'cnfatmakaqdeijhp').trim()
    }
});

// Verify connection configuration
transporter.verify((error, success) => {
    if (error) {
        console.log('[MAILER] Connection error:', error.message);
    } else {
        console.log('[MAILER] Server is ready to take messages');
    }
});

/**
 * Send a generic email
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} text - Plain text body
 */
const sendEmail = async (to, subject, text) => {
    const fromEmail = process.env.EMAIL_USER || 'managemadhura123@gmail.com';
    const mailOptions = {
        from: fromEmail,
        to,
        subject,
        text
    };

    // We use the hardcoded fallbacks if process.env is missing, so we don't need the if check here
    try {
        console.log(`[MAILER] Attempting to send email to: ${to} (Subject: ${subject})`);
        const info = await transporter.sendMail(mailOptions);
        console.log(`[MAILER] Email sent successfully to ${to}. MessageId: ${info.messageId}`);
        
        // Write to a log file for audit
        const logContent = `[${new Date().toISOString()}] SUCCESS: Email to ${to}, Subject: ${subject}, MessageId: ${info.messageId}\n`;
        fs.appendFileSync(path.join(__dirname, '../mailer.log'), logContent);
        
        return info;
    } catch (err) {
        console.error(`[MAILER] FAILED to send email to ${to}:`, err.message);
        const logContent = `[${new Date().toISOString()}] FAILED: Email to ${to}, Error: ${err.message}\n`;
        fs.appendFileSync(path.join(__dirname, '../mailer.log'), logContent);
        throw err; 
    }
};

module.exports = { sendEmail, transporter };
