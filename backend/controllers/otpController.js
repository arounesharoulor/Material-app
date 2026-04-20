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

        // Parallel: Delete existing OTP and save new one simultaneously
        await Promise.all([
            Otp.deleteMany({ email }),
            newOtp.save()
        ]);

        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            // Fire-and-forget — do NOT await, respond immediately
            sendEmail(email, 'Your Verification Code', `Your OTP for verification is: ${otp}. This code will expire in 5 minutes.`);
            return res.json({ msg: 'Verification code sent to ' + email });
        } else {
            console.log('--- DEV MODE OTP for ' + email + ': ' + otp + ' ---');
            return res.json({ msg: 'OTP generated (dev mode)', devOtp: otp });
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
            Otp.deleteOne({ email }).catch(() => {});
            return res.status(400).json({ msg: 'Too many failed attempts. Please request a new OTP.' });
        }

        if (otpRecord.otp !== otp) {
            otpRecord.attempts += 1;
            await otpRecord.save();
            const remaining = 3 - otpRecord.attempts;
            return res.status(400).json({ msg: `Invalid OTP. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.` });
        }

        // Success — delete OTP without blocking the success response
        Otp.deleteOne({ email }).catch(() => {});
        res.json({ success: true, msg: 'OTP verified successfully' });

    } catch (err) {
        console.error('OTP Verify Error:', err.message);
        res.status(500).json({ msg: 'Server error during verification' });
    }
};
