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
                    // Build a detailed response object for diagnostics
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
                            const err = new Error(parsed.error || `HTTP error ${res.statusCode}: ${responseBody}`);
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

        req.on('error', (err) => {
            reject(err);
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timed out after 15s'));
        });

        req.write(postData);
        req.end();
    });
};

/**
 * Send an email using Gmail via Vercel Serverless HTTPS Proxy
 */
const sendEmail = async (to, subject, text) => {
    try {
        console.log(`[MAILER] Sending email to ${to} via Vercel HTTPS proxy...`);
        // First, attempt proxy-based send (keeps credentials out of origin response)
        try {
            const result = await httpsPost('https://materialappmanager.vercel.app/api/send-email', {
                to,
                subject,
                text,
                user: EMAIL_USER,
                pass: EMAIL_PASS
            });

            if (result && result.success) {
                console.log(`[MAILER] ✅ Email sent via proxy to ${to}. MessageId: ${result.messageId}`);
                return result;
            }
            // If proxy responded but not success, throw to enter fallback
            throw new Error(result && result.error ? result.error : 'Unknown proxy error');
        } catch (proxyErr) {
            // Attach proxy response if present for better logging
            console.error('[MAILER] Proxy send failed:', proxyErr.message, proxyErr.response || 'no-response-details');
            // Fallback: try direct SMTP send from this backend (useful when proxy is broken)
            try {
                console.log('[MAILER] Attempting direct SMTP send as fallback...');
                const transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: { user: EMAIL_USER, pass: EMAIL_PASS }
                });

                const mailOptions = { from: `"Material App" <${EMAIL_USER}>`, to, subject, text };
                const info = await transporter.sendMail(mailOptions);
                console.log(`[MAILER] ✅ Email sent directly to ${to}. MessageId: ${info.messageId}`);
                return { success: true, messageId: info.messageId, fallback: true };
            } catch (directErr) {
                console.error('[MAILER] Direct SMTP send also failed:', directErr.message);
                // Prefer proxyErr.response when available
                const e = proxyErr || directErr;
                throw e;
            }
        }
    } catch (err) {
        console.error(`[MAILER] ❌ Failed to send email to ${to}:`, err.message);
        throw err;
    }
};

module.exports = { sendEmail };
