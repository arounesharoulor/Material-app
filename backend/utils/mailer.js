// utils/mailer.js
const nodemailer = require('nodemailer');

const sendEmail = async (to, subject, text) => {
    try {
        console.log(`[MAILER] Trying to send email to: ${to}`);

        function createTransporter() {
            // Default to STARTTLS (port 587) which is open on most cloud hosts.
            // Allow overriding via MAIL_PORT env var for custom setups.
            const port = process.env.MAIL_PORT ? parseInt(process.env.MAIL_PORT, 10) : 587;
            const secure = port === 465; // true only for SSL (465), false for STARTTLS (587)
            return nodemailer.createTransport({
                service: 'gmail',
                host: 'smtp.gmail.com',
                port,
                secure,
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS,
                },
                connectionTimeout: 30000,
                socketTimeout: 30000,
                tls: { rejectUnauthorized: false },
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