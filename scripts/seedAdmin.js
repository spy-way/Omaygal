// scripts/seedAdmin.js

require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const Admin = require('../models/Admin');

// MongoDB Connection URI
const mongoURI = process.env.MONGODB_URI;

if (!mongoURI) {
    console.error('Error: MONGODB_URI is not defined in environment variables.');
    process.exit(1);
}

// Connect to MongoDB
// mongoose
//     .connect(mongoURI)
//     .then(() => {
//         console.log('MongoDB connected successfully.');
//         return createAdminUser();
//     })

    mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => {
    console.log('Connected to MongoDB');
    return createAdminUser();
})
    
    .catch((err) => {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    });

async function createAdminUser() {
    try {
        const username = 'admin'; // Set your desired username
        const password = 'admin'; // Set your desired password

        // Check if an admin user already exists
        const existingAdmin = await Admin.findOne({ username });
        if (existingAdmin) {
            console.log('Admin user already exists.');
            process.exit(0);
        }

        const newAdmin = new Admin({ username, password });
        await newAdmin.save();
        console.log(`Admin user '${username}' created successfully.`);
        process.exit(0);
    } catch (err) {
        console.error('Error creating admin user:', err);
        process.exit(1);
    }
}
