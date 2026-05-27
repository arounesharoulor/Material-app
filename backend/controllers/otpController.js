const { sendEmail } = require('../utils/mailer');
const Otp = require('../models/Otp');
const crypto = require('crypto');

exports.sendOtp = async (req, res) => {
    const { email } = req.body;

    if (!email || !/\S+@\S+\.\S+/.test(email)) {
        return res.status(400).json({ msg: 'Please provide a valid email address' });
    }

    try {
        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const newOtp = new Otp({ email, otp });

        // Delete existing OTP first, THEN save the new one to prevent race conditions
        await Otp.deleteMany({ email });
        await newOtp.save();

        // Send email and AWAIT it so failures are reported back to the client
        const sendStart = Date.now();
        try {
            await sendEmail(
                email,
                'Your Verification Code',
                `Your OTP for verification is: ${otp}. This code will expire in 5 minutes.`
            );
            const sendDuration = Date.now() - sendStart;
            console.log(`[OTP] Email sent to ${email} in ${sendDuration}ms`);

            // Return duration for short-term debugging; do not expose OTP in production
            const responsePayload = { msg: 'Verification code sent to ' + email, debugDurationMs: sendDuration };
            if (process.env.NODE_ENV !== 'production') responsePayload.devOtp = otp;
            return res.json(responsePayload);
        } catch (mailErr) {
            const sendDuration = Date.now() - sendStart;
            console.error('[OTP] Email delivery failed:', mailErr && (mailErr.message || mailErr.toString()));
            console.error('[OTP] Mail error details:', {
                name: mailErr.name,
                message: mailErr.message,
                code: mailErr.code,
                responseCode: mailErr.responseCode,
                stack: mailErr.stack
            });
            console.error(`[OTP] Email attempt took ${sendDuration}ms before failing`);
            // Clean up the saved OTP so the user can try again cleanly
            await Otp.deleteMany({ email });
            const payload = {
                msg: 'Could not send verification email. Please check your email address and try again.',
                debugDurationMs: sendDuration,
                debug: mailErr.message || String(mailErr)
            };
            // If the mailer attached a response object (proxy details), include key fields for diagnosis
            if (mailErr.response) {
                payload.proxy = {
                    statusCode: mailErr.response.statusCode,
                    headers: mailErr.response.headers,
                    body: mailErr.response.body
                };
            }
            // Include stack in non-production to help diagnose deployed errors
            if (process.env.NODE_ENV !== 'production') {
                payload.debugStack = mailErr.stack;
            }
            return res.status(500).json(payload);
        }
    } catch (err) {
        console.error('OTP Send Error:', err.message);
        res.status(500).json({ msg: 'Error processing verification' });
    }
};

exports.verifyOtp = async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ msg: 'Email and OTP are required' });
    }

    try {
        const otpRecord = await Otp.findOne({ email });

        if (!otpRecord) {
            return res.status(400).json({ msg: 'OTP expired or not found. Please request a new code.' });
        }

        if (otpRecord.attempts >= 3) {
            // Use deleteOne without awaiting to not delay the response
            Otp.deleteOne({ email }).catch(() => { });
            return res.status(400).json({ msg: 'Too many failed attempts. Please request a new OTP.' });
        }

        if (otpRecord.otp !== otp) {
            otpRecord.attempts += 1;
            await otpRecord.save();
            const remaining = 3 - otpRecord.attempts;
            return res.status(400).json({ msg: `Invalid OTP. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.` });
        }

        // Success — delete OTP without blocking the success response
        Otp.deleteOne({ email }).catch(() => { });
        res.json({ success: true, msg: 'OTP verified successfully' });

    } catch (err) {
        console.error('OTP Verify Error:', err.message);
        res.status(500).json({ msg: 'Server error during verification' });
    }
};
