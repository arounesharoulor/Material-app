const Attendance = require('../models/Attendance');

exports.markAttendance = async (req, res) => {
    try {
        const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
        
        let attendance = await Attendance.findOne({ user: req.user.id, date: today });
        if (attendance) {
            return res.status(400).json({ msg: 'Attendance already marked for today' });
        }

        attendance = new Attendance({
            user: req.user.id,
            date: today,
            status: 'Pending'
        });

        await attendance.save();

        const io = req.app.get('io');
        if (io) io.emit('attendanceUpdate');

        res.json(attendance);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.getMyAttendance = async (req, res) => {
    try {
        const attendance = await Attendance.find({ user: req.user.id }).sort({ date: -1 });
        res.json(attendance);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.getAllAttendance = async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ msg: 'Access denied' });
        }
        const attendance = await Attendance.find().populate('user', ['name', 'employeeId']).sort({ date: -1 });
        res.json(attendance);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.updateAttendanceStatus = async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ msg: 'Access denied' });
        }
        const { status } = req.body;
        if (!['Approved', 'Rejected'].includes(status)) {
            return res.status(400).json({ msg: 'Invalid status' });
        }

        const attendance = await Attendance.findById(req.params.id);
        if (!attendance) {
            return res.status(404).json({ msg: 'Attendance record not found' });
        }

        attendance.status = status;
        await attendance.save();

        const io = req.app.get('io');
        if (io) io.emit('attendanceUpdate');

        res.json(attendance);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};
