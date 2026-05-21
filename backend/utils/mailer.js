const https = require('https');
const fs = require('fs');
const path = require('path');

// Fallback to a placeholder if user hasn't added the ENV variable yet
const RESEND_API_KEY = process.env.RESEND_API_KEY || 're_your_api_key_here';

console.log(`[MAILER] Configured to use Resend REST API via HTTPS`);

/**
 * Send an email using Resend API (Bypasses Render SMTP blocking entirely)
 */
const sendEmail = async (to, subject, text) => {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            // Resend requires using their onboarding domain UNLESS you verify a custom domain in their dashboard
            from: 'Material App <onboarding@resend.dev>',
            to: [to], // Note: The free Resend tier ONLY allows sending to the email address you signed up with until you add a domain.
            subject: subject,
            text: text
        });

        const options = {
            hostname: 'api.resend.com',
            path: '/emails',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        console.log(`[RESEND] Attempting to send email to: ${to} (Subject: ${subject})`);

        const req = https.request(options, (res) => {
            let responseBody = '';
            res.on('data', chunk => responseBody += chunk);
            res.on('end', () => {
                try {
                    const data = JSON.parse(responseBody);
                    
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        console.log(`[RESEND] ✅ Email sent to ${to}. MessageId: ${data.id}`);
                        
                        try {
                            const logContent = `[${new Date().toISOString()}] SUCCESS: Resend to ${to}, Subject: ${subject}, MessageId: ${data.id}\n`;
                            fs.appendFileSync(path.join(__dirname, '../mailer.log'), logContent);
                        } catch (_) {}
                        
                        resolve(data);
                    } else {
                        // Resend rejected it (e.g. invalid API key, unverified recipient)
                        console.error(`[RESEND] ❌ Failed API Response: ${responseBody}`);
                        throw new Error(data.message || `Resend error: ${res.statusCode}`);
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', (err) => {
            console.error(`[RESEND] ❌ HTTPS Request Failed:`, err.message);
            try {
                const logContent = `[${new Date().toISOString()}] FAILED: Resend to ${to}, Error: ${err.message}\n`;
                fs.appendFileSync(path.join(__dirname, '../mailer.log'), logContent);
            } catch (_) {}
            reject(err);
        });

        req.write(payload);
        req.end();
    });
};

module.exports = { sendEmail };
