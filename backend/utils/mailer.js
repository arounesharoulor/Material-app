// utils/mailer.js
const nodemailer = require('nodemailer');

const sendEmail = async (to, subject, text) => {
    try {
        console.log(`[MAILER] Trying to send email to: ${to}`);

        function createTransporter() {
            // Force port 465 and secure: true for Gmail to avoid STARTTLS timeouts on Render
            return nodemailer.createTransport({
                service: 'gmail',
                host: 'smtp.gmail.com',
                port: 465,
                secure: true,
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