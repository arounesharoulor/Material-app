const nodemailer = require('nodemailer');

const EMAIL_USER = process.env.EMAIL_USER || 'managemadhura123@gmail.com';
const EMAIL_PASS = process.env.EMAIL_PASS || 'dohzspvemkycjkxj';

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
    }
});

console.log(`[MAILER] Configured to use Gmail: ${EMAIL_USER}`);

/**
 * Send an email using Gmail via Nodemailer
 */
const sendEmail = async (to, subject, text) => {
    const mailOptions = {
        from: `"Material App" <${EMAIL_USER}>`,
        to,
        subject,
        text
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`[MAILER] ✅ Email sent to ${to}. MessageId: ${info.messageId}`);
        return info;
    } catch (err) {
        console.error(`[MAILER] ❌ Failed to send email to ${to}:`, err.message);
        throw err;
    }
};

module.exports = { sendEmail };
