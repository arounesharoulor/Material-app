const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/User');
const Stock = require('./models/Stock');
const bcrypt = require('bcryptjs');
const dns = require('dns');

// DNS fix
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4']);

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

const seedDB = async () => {
    await User.deleteMany({});
    await Stock.deleteMany({});

    // Seed Users
    const salt = await bcrypt.genSalt(10);
    const password = await bcrypt.hash('password123', salt);

    await User.create([
        { name: 'Admin User', employeeId: 'admin001', email: 'admin@test.com', password, role: 'Admin' },
        { name: 'John Doe', employeeId: 'emp001', email: 'employee@test.com', password, role: 'Employee' }
    ]);

    // Seed Stock
    await Stock.create([
        { materialName: 'Laptops', quantity: 10 },
        { materialName: 'Monitors', quantity: 20 },
        { materialName: 'Keyboards', quantity: 50 },
        { materialName: 'Mouse', quantity: 50 }
    ]);

    console.log('Database seeded successfully! (Admin: admin@test.com | Employee: employee@test.com, password: password123)');
    process.exit(0);
}

seedDB();
