# Savanna Cloud

## Interactive Word Reveal & Word Cloud App

An interactive web application for live presentations and workshops that combines guided letter‑by‑letter word reveal with real‑time word cloud generation.
The app is designed to support facilitation, collective thinking, and audience engagement by revealing a solution step by step while capturing ideas throughout a session.

## 🧭 Overview

The application consists of two synchronized views:

### Presentation View

Displayed to the audience (e.g. projector or main screen).
Shows:

Letter boxes representing a hidden solution word
A live word cloud that visualizes participant input

### Admin View

Used by the facilitator to control the session flow.
Allows:

Setting the solution word
Revealing letters step by step
Entering words for the word cloud
Ending the session and generating a final summary cloud

## ✨ Core Features

Progressive letter reveal

The solution word is split into letter boxes
Letters are revealed one by one in a defined order
Visual focus on the most recently revealed letter

Live word cloud

Words entered via the admin view appear instantly
Word cloud resets after each letter reveal
All entered words are stored during the session

Session summary

At the end of a session, a final word cloud is generated
Includes all words collected throughout the session

Dual‑screen architecture

Clean separation between audience display and admin controls
Optimized for workshops, training sessions, and live facilitation

Calm, neutral design

Elephant / savannah‑inspired color palette
High readability on large screens and projectors

## 🎯 Use Cases

Interactive workshops
Training and learning sessions
Brainstorming and ideation
Retrospectives and reviews
Moderated discussions and presentations

## 🧠 Concept

The app follows a guided discovery approach:
Participants freely contribute ideas, while the facilitator reveals the solution gradually. This keeps attention high, encourages reflection, and culminates in a collective insight visualized through the final word cloud.

## 🚀 Getting Started

Open the Admin View
Define the solution word
Start the session
Enter words and reveal letters step by step
Finish the session to generate the final word cloud

### Requirements

- Node.js (LTS recommended)

### Install

- Install dependencies:

  ```powershell
  npm install
  ```

- (Optional Windows helper) Run `install-node.ps1` to set up Node if needed:

  ```powershell
  .\install-node.ps1
  ```

### Run

- Start the server directly:

  ```powershell
  node server.js
  ```

- Or use the Windows helper:

  ```powershell
  .\start.ps1
  ```

### Project layout

- [server.js](server.js) — main Express/HTTP server entry
- [package.json](package.json) — npm metadata and scripts
- [install-node.ps1](install-node.ps1) — optional Windows Node installer helper
- [start.ps1](start.ps1) — optional Windows start helper
- [public](public) — static web files (HTML, JS, CSS, images)
- [sessions](sessions) — JSON session files (runtime data)

### Admin access and security

- The admin area is now protected by a simple password-based login. Unauthenticated requests for the admin UI and its admin assets are redirected to `/admin-login.html`.
- Default admin password: `changeme`. Set a stronger password before running in production by exporting `ADMIN_PASSWORD` in your environment. Example (PowerShell):

  ```powershell
  $env:ADMIN_PASSWORD = 'your-strong-password'
  node server.js
  ```

- To sign in, open `/admin-login.html`, enter the password, and submit the form. A temporary admin token cookie is set for the session; you can sign out via the "Sign out" link in the admin UI which hits `/admin-logout`.
- Note: admin tokens are stored in-memory by the server process. Restarting the server will invalidate tokens and require re-login.
- For better security in production consider:
  - Setting a strong `ADMIN_PASSWORD` and running the app behind HTTPS.
  - Replacing the simple token store with persistent sessions (e.g. `express-session`) or integrating with an SSO/OAuth provider.
  - Adding rate limiting and lockout for repeated failed login attempts.

### Notes

- Session files in the `sessions` folder are plain JSON and may contain ephemeral or user session data. Do not commit sensitive session files to version control; add `sessions/` to `.gitignore` if you plan to keep local runtime data.

## 🤝 Contributing

Contributions, ideas, and improvements are welcome.
Feel free to open issues or submit pull requests.

## 📄 License

This project is released under the MIT License.
You are free to use, modify, and distribute this software for both personal purposes, as long as the original copyright and license notice are included.
See the LICENSE file for full details.
