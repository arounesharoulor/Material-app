const mongoose = require('mongoose');
const dns = require('dns');

// Fix for querySrv ECONNREFUSED on some networks (common with Node 18+)
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const connectDB = async () => {
    try {
        const uri = process.env.MONGO_URI || "mongodb+srv://arounesharoulor_db_user:GytVRhtHlKCLwzIG@materialapp.t8wxpqk.mongodb.net/Materialtest?retryWrites=true&w=majority&appName=MaterialApp";
        await mongoose.connect(uri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('✅ MongoDB Connected (Local/Cloud)');
    } catch (err) {
        console.error('❌ MongoDB connection error:', err.message);
        console.log('Server is running but database functions will fail until connected.');
    }
};
module.exports = connectDB;
