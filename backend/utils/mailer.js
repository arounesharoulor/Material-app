// utils/mailer.js
// ─────────────────────────────────────────────────────────────────────
// Email sender using Nodemailer (SMTP).
//
// Required/Preferred env vars:
//   EMAIL_USER=<gmail address or SMTP username>
//   EMAIL_PASS=<gmail app password or SMTP password>
//   EMAIL_FROM=<optional sender address>
//
//   or:
//   SMTP_USER=<gmail address or SMTP username>
//   SMTP_PASS=<gmail app password or SMTP password>
//   SMTP_FROM=<optional sender address>
// ─────────────────────────────────────────────────────────────────────
'use strict';

const nodemailer = require('nodemailer');

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
        service: (process.env.SMTP_SERVICE || 'gmail').trim(),
    };
};

const sendEmail = async (to, subject, text, html = null) => {
    const config = getSmtpConfig();
    if (!config) {
        throw new Error('[MAILER] SMTP credentials (EMAIL_USER/EMAIL_PASS or SMTP_USER/SMTP_PASS) are not configured in environment variables.');
    }

    console.log(`\n[MAILER] Sending email to: ${to} via SMTP`);

    let resolvedHost = config.host || 'smtp.gmail.com';
    try {
        const { address } = await require('dns').promises.lookup(resolvedHost, { family: 4 });
        console.log(`[MAILER] Resolved ${resolvedHost} to IPv4: ${address}`);
        resolvedHost = address;
    } catch (err) {
        console.warn(`[MAILER] Failed to resolve IPv4 for ${resolvedHost}. Using original host.`, err.message);
    }

    const transportOptions = {
        host: resolvedHost,
        port: config.host ? config.port : 587,
        secure: config.host ? config.secure : false,
        ...( (!config.host || !config.secure) ? { requireTLS: true } : {} ),
        auth: {
            user: config.user,
            pass: config.pass,
        },
        pool: true,
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 15000,
        tls: {
            rejectUnauthorized: false,
            servername: config.host || 'smtp.gmail.com'
        }
    };


    const transporter = nodemailer.createTransport(transportOptions);
    const info = await transporter.sendMail({
        from: `"Madhura Energy" <${config.from}>`,
        to,
        subject,
        text,
        ...(html ? { html } : {}),
    });

    console.log(`[MAILER] Email sent successfully via SMTP. Message ID: ${info.messageId || 'unknown'}`);
    return { success: true, messageId: info.messageId };
};

module.exports = { sendEmail };
