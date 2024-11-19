// middleware/auth.js

function isAdminAuthenticated(req, res, next) {
    if (req.session && req.session.adminId) {
        next();
    } else {
        res.redirect('/admin/login');
    }
}

module.exports = {
    isAdminAuthenticated,
};
