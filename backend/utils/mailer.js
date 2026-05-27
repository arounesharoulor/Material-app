const nodemailer = require('nodemailer');

const EMAIL_USER = process.env.EMAIL_USER || 'managemadhura123@gmail.com';
const EMAIL_PASS = process.env.EMAIL_PASS || 'dohzspvemkycjkxj';

const dns = require('dns');

// Force IPv4 DNS resolution for SMTP to prevent ENETUNREACH on IPv6-only environments
dns.setDefaultResultOrder('ipv4first');

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // Use STARTTLS (more reliable on cloud hosting than port 465 SSL)
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
    },
    family: 4, // Force IPv4 socket connection
    connectionTimeout: 15000, // 15 seconds to establish connection
    greetingTimeout: 15000, // 15 seconds for SMTP greeting
    socketTimeout: 30000, // 30 seconds for socket inactivity
    logger: false,
    debug: false,
    tls: {
        rejectUnauthorized: false // Allow self-signed certificates on some hosting environments
    }
});

console.log(`[MAILER] Configured to use Gmail: ${EMAIL_USER}`);

// Verify SMTP connection on startup
transporter.verify()
    .then(() => console.log('[MAILER] ✅ SMTP connection verified successfully'))
    .catch((err) => console.error('[MAILER] ⚠️ SMTP connection verification failed:', err.message));

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
