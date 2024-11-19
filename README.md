# CHEEVO - RANDOM VIDEO CALLS AND TEXT APP
A random video calling and chatting web app advanced Omegle alternative.

Cheevo Live is a web application that allows users to engage in anonymous chat and video conversations with strangers. It includes features like user reporting, IP banning, and an admin dashboard for managing the application.

Features
Anonymous Chat: Connect with random strangers for text-based conversations.
Video Chat: Engage in video calls with randomly paired partners.
User Reporting: Report inappropriate behavior during chat or video sessions.
IP Banning: Admins can ban users based on their IP address to prevent misuse.
Admin Dashboard: View reports, manage bans, and monitor active sessions.
Security Measures: Implements rate limiting, IP blocking, and content security policies.
Technologies Used
Frontend:
HTML, CSS, JavaScript
EJS Templates
Tailwind CSS (via CDN)
Backend:
Node.js
Express.js
Socket.IO
MongoDB with Mongoose
Express-session with connect-mongo for session management
Middleware and Security:
Helmet for security headers
CORS for cross-origin resource sharing
Express-rate-limit for rate limiting
Morgan for logging
Admin Panel
The admin panel allows administrators to manage user reports, ban IP addresses, and monitor active sessions.

Admin Features
View Reports: Access detailed user reports and take appropriate actions.
Ban Users: Ban users by IP address to prevent abuse.
Delete Reports: Remove resolved or invalid reports from the system.
Monitor Active Sessions: Keep track of current chat and video sessions in real-time.


To try out Cheevo, visit: https://cheevo.live
