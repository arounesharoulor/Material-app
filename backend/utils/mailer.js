const nodemailer = require('nodemailer');
const dns = require('dns');
const { promisify } = require('util');

const resolve4 = promisify(dns.resolve4);

const EMAIL_USER = process.env.EMAIL_USER || 'managemadhura123@gmail.com';
const EMAIL_PASS = process.env.EMAIL_PASS || 'dohzspvemkycjkxj';

let transporterInstance = null;

/**
 * Dynamically resolves smtp.gmail.com to an IPv4 address to bypass
 * Render's ENETUNREACH IPv6 networking issues, then creates a transporter.
 */
const getTransporter = async () => {
    if (transporterInstance) return transporterInstance;

    let hostIp = 'smtp.gmail.com';
    try {
        const addresses = await resolve4('smtp.gmail.com');
        if (addresses && addresses.length > 0) {
            hostIp = addresses[0]; // Use the first IPv4 address
            console.log(`[MAILER] Resolved smtp.gmail.com to IPv4: ${hostIp}`);
        }
    } catch (err) {
        console.error('[MAILER] DNS lookup failed, falling back to hostname:', err.message);
    }

    transporterInstance = nodemailer.createTransport({
        host: hostIp,
        port: 587,
        secure: false, // STARTTLS
        auth: {
            user: EMAIL_USER,
            pass: EMAIL_PASS
        },
        tls: {
            // Must specify servername when connecting via direct IP for TLS to work
            servername: 'smtp.gmail.com',
            rejectUnauthorized: false
        },
        // Prevent hanging
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 30000,
    });

    try {
        await transporterInstance.verify();
        console.log('[MAILER] ✅ SMTP connection verified successfully (IPv4)');
    } catch (err) {
        console.error('[MAILER] ⚠️ SMTP connection verification failed:', err.message);
    }

    return transporterInstance;
};

/**
 * Send an email using Gmail via Nodemailer
 */
const sendEmail = async (to, subject, text) => {
    try {
        const transporter = await getTransporter();
        
        const mailOptions = {
            from: `"Material App" <${EMAIL_USER}>`,
            to,
            subject,
            text
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`[MAILER] ✅ Email sent to ${to}. MessageId: ${info.messageId}`);
        return info;
    } catch (err) {
        console.error(`[MAILER] ❌ Failed to send email to ${to}:`, err.message);
        throw err;
    }
};

module.exports = { sendEmail };
