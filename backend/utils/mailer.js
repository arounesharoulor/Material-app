const https = require('https');
const nodemailer = require('nodemailer');

const EMAIL_USER = process.env.EMAIL_USER || 'managemadhura123@gmail.com';
const EMAIL_PASS = process.env.EMAIL_PASS || 'dohzspvemkycjkxj';

/**
 * Robust HTTPS POST helper using Node.js standard library
 */
const httpsPost = (url, data) => {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const postData = JSON.stringify(data);

        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + (urlObj.search || ''),
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'Accept': 'application/json',
                'User-Agent': 'material-app-mailer/1.0'
            },
            timeout: 15000
        };

        const req = https.request(options, (res) => {
            let responseBody = '';
            res.on('data', (chunk) => {
                responseBody += chunk;
            });
            res.on('end', () => {
                const resDetails = {
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: responseBody
                };

                if (!responseBody) {
                    const err = new Error(`Empty response body (status ${res.statusCode})`);
                    err.response = resDetails;
                    return reject(err);
                }

                try {
                    const parsed = JSON.parse(responseBody);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(parsed);
                    } else {
                        const err = new Error(parsed.error || `HTTP error ${res.statusCode}`);
                        err.response = resDetails;
                        return reject(err);
                    }
                } catch (e) {
                    const err = new Error(`Non-JSON response (status ${res.statusCode})`);
                    err.response = resDetails;
                    return reject(err);
                }
            });
        });

        req.on('error', (err) => reject(err));
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timed out after 15s'));
        });

        req.write(postData);
        req.end();
    });
};

/**
 * Send an email using Gmail - FIXED & IMPROVED
 */
const sendEmail = async (to, subject, text) => {
    try {
        console.log(`[MAILER] Attempting to send email to: ${to}`);

        // === DIRECT SMTP (Primary Method - Most Reliable) ===
        try {
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                host: 'smtp.gmail.com',
                port: 465,
                secure: true,
                auth: {
                    user: EMAIL_USER,
                    pass: EMAIL_PASS,
                },
                tls: {
                    rejectUnauthorized: false
                }
            });

            const mailOptions = {
                from: `"Madhura Energy" <${EMAIL_USER}>`,
                to: to,
                subject: subject,
                text: text,
            };

            const info = await transporter.sendMail(mailOptions);
            
            console.log(`✅ [MAILER] Email sent successfully (Direct SMTP) to ${to}`);
            console.log(`Message ID: ${info.messageId}`);
            
            return { 
                success: true, 
                messageId: info.messageId, 
                method: 'direct' 
            };

        } catch (directErr) {
            console.error('[MAILER] Direct SMTP failed:', directErr.message);

            // === FALLBACK: Try Vercel Proxy ===
            console.log('[MAILER] Trying Vercel proxy fallback...');
            try {
                const result = await httpsPost('https://materialappmanager.vercel.app/api/send-email', {
                    to,
                    subject,
                    text,
                    user: EMAIL_USER,
                    pass: EMAIL_PASS
                });

                if (result && result.success) {
                    console.log(`✅ [MAILER] Email sent via proxy to ${to}`);
                    return result;
                }
                throw new Error('Proxy returned failure');
            } catch (proxyErr) {
                console.error('[MAILER] Proxy fallback also failed:', proxyErr.message);
                throw new Error(`Email sending failed: ${directErr.message}`);
            }
        }

    } catch (err) {
        console.error(`❌ [MAILER] Final failure to send email to ${to}:`, err.message);
        throw err;
    }
};

module.exports = { sendEmail };