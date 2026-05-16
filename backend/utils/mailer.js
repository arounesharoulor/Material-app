const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'managemadhura123@gmail.com',
        pass: process.env.EMAIL_PASS || 'eugxkrfdszghuzud'
    }
});

// Verify connection configuration
transporter.verify((error, success) => {
    if (error) {
        console.log('[MAILER] Connection error:', error.message);
    } else {
        const user = process.env.EMAIL_USER || 'managemadhura123@gmail.com';
        console.log(`[MAILER] Server ready. Account: ${user.substring(0, 4)}...`);
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

    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        try {
            console.log(`[MAILER] Sending email to ${to}...`);
            await transporter.sendMail(mailOptions);
            console.log(`[MAILER] Email sent successfully to ${to}`);
        } catch (err) {
            console.error(`[MAILER] Error sending email to ${to}:`, err.message);
        }
    } else {
        console.log(`[MAILER-DEV] To: ${to} | Subject: ${subject} | Body: ${text}`);
    }
};

module.exports = { sendEmail, transporter };
