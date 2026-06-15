// utils/mailer.js
// ─────────────────────────────────────────────────────────────────────
// Email sender using Nodemailer (SMTP).
// Hardened for cloud deployments (Render, Railway, etc.) that may
// default to IPv6, causing ENETUNREACH errors with smtp.gmail.com.
// ─────────────────────────────────────────────────────────────────────
'use strict';

const nodemailer = require('nodemailer');
const dns = require('dns');

// Force Node.js DNS to prefer IPv4 globally
if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}

const getSmtpConfig = () => {
    const user = (
        process.env.SMTP_USER ||
        process.env.EMAIL_USER ||
        process.env.GMAIL_USER ||
        ''
    ).trim();
    const pass = (
        process.env.SMTP_PASS ||
        process.env.EMAIL_PASS ||
        process.env.GMAIL_APP_PASSWORD ||
        ''
    ).trim();

    if (!user || !pass) {
        return null;
    }

    return {
        user,
        pass,
        from: (process.env.SMTP_FROM || process.env.EMAIL_FROM || user).trim(),
        host: (process.env.SMTP_HOST || '').trim(),
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    };
};

/**
 * Resolve a hostname to an IPv4 address explicitly.
 * Falls back to the original hostname if resolution fails.
 */
const resolveIPv4 = async (hostname) => {
    try {
        const { address } = await dns.promises.lookup(hostname, { family: 4 });
        console.log(`[MAILER] Resolved ${hostname} → IPv4: ${address}`);
        return address;
    } catch (err) {
        console.warn(`[MAILER] IPv4 resolution failed for ${hostname}: ${err.message}. Using hostname directly.`);
        return hostname;
    }
};

const sendEmail = async (to, subject, text, html = null) => {
    const config = getSmtpConfig();
    if (!config) {
        throw new Error('[MAILER] SMTP credentials not configured. Set EMAIL_USER and EMAIL_PASS in environment.');
    }

    console.log(`\n[MAILER] Sending email to: ${to}`);

    const smtpHost = config.host || 'smtp.gmail.com';
    const smtpPort = config.host ? config.port : 465;
    const smtpSecure = config.host ? config.secure : true;

    // Manually resolve to IPv4 to prevent ENETUNREACH on IPv6-only DNS
    const resolvedHost = await resolveIPv4(smtpHost);

    const transportOptions = {
        host: resolvedHost,
        port: smtpPort,
        secure: smtpSecure,
        requireTLS: true,
        auth: {
            user: config.user,
            pass: config.pass,
        },
        connectionTimeout: 30000,
        greetingTimeout: 30000,
        socketTimeout: 30000,
        tls: {
            servername: smtpHost,   // TLS SNI must be the hostname, not the IP
            rejectUnauthorized: false,
        },
    };

    console.log(`[MAILER] Connecting to ${resolvedHost}:${smtpPort} (secure=${smtpSecure})`);

    const transporter = nodemailer.createTransport(transportOptions);
    const info = await transporter.sendMail({
        from: `"Madhura Energy" <${config.from}>`,
        to,
        subject,
        text,
        ...(html ? { html } : {}),
    });

    console.log(`[MAILER] ✅ Email sent. Message ID: ${info.messageId || 'unknown'}`);
    return { success: true, messageId: info.messageId };
};

module.exports = { sendEmail };
