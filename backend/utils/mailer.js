// utils/mailer.js
const nodemailer = require('nodemailer');
const dns = require('dns').promises;

const sendEmail = async (to, subject, text) => {
    try {
        console.log(`[MAILER] Trying to send email to: ${to}`);

        // Resolve smtp.gmail.com to IPv4 to bypass Vercel/Render IPv6 connection issues (ENETUNREACH)
        let host = 'smtp.gmail.com';
        try {
            const addresses = await dns.resolve4('smtp.gmail.com');
            if (addresses && addresses.length > 0) {
                host = addresses[0];
                console.log(`[MAILER] Resolved smtp.gmail.com to IPv4 address: ${host}`);
            }
        } catch (dnsError) {
            console.error('[MAILER] DNS resolution for smtp.gmail.com failed, using default hostname:', dnsError.message);
        }

        function createTransporter() {
            // Force port 465 and secure: true for Gmail to avoid STARTTLS timeouts on Render
            return nodemailer.createTransport({
                host: host,
                port: 465,
                secure: true,
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS,
                },
                connectionTimeout: 30000,
                socketTimeout: 30000,
                tls: {
                    servername: 'smtp.gmail.com',
                    rejectUnauthorized: false
                },
            });
        }

        const transporter = createTransporter();
        // Verify connection configuration at startup – helps surface auth issues early
        if (process.env.NODE_ENV === 'development') {
    transporter.verify(function (error, success) {
        if (error) {
            console.error('[MAILER] Verification failed:', error);
        } else {
            console.log('[MAILER] Server is ready to take messages');
        }
    });
}

        const mailOptions = {
            from: `"Madhura Energy" <${process.env.EMAIL_USER}>`,
            to: to,
            subject: subject,
            text: text,
        };

        const info = await transporter.sendMail(mailOptions);

        console.log(`✅ [MAILER] SUCCESS - Email sent to ${to} | MessageId: ${info.messageId}`);
        return { success: true, messageId: info.messageId };

    } catch (error) {
        console.error('❌ [MAILER] FAILED to send email:');
        console.error('Code:', error.code);
        console.error('Message:', error.message);
        console.error('Full Error:', error);
        
        throw error; // Let controller handle it
    }
};

module.exports = { sendEmail };