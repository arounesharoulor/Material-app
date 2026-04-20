const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

/**
 * Send a generic email
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} text - Plain text body
 */
const sendEmail = async (to, subject, text) => {
    const mailOptions = {
        from: process.env.EMAIL_USER,
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
