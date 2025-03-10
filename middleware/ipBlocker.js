// middleware/ipBlocker.js

const BannedIP = require('../models/BannedIP');

async function ipBlocker(req, res, next) {
  app.set("trust proxy", true);
  //  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  var ip = req.ip; 
   
    const banned = await BannedIP.findOne({ ip });
    if (banned) {
        res.status(403).send('Your IP has been banned.');
    } else {
        next();
    }
}

module.exports = ipBlocker;
