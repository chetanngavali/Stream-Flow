# StreamFlow — Deployment & Operations Guide

This guide provides end-to-end instructions for deploying, configuring, and operating the **StreamFlow** Web Application using Google Apps Script, Google Sheets, and Google Drive.

---

## 1. Prerequisites

1. **Google Account:** With access to Google Drive, Google Sheets, and Google Apps Script.
2. **Node.js:** v18+ or v20+ with npm.
3. **Clasp CLI:** Google's Command Line Apps Script Projects tool:
   ```bash
   npm install -g @google/clasp
   ```
4. **Google Apps Script API Enabled:**
   - Visit [https://script.google.com/home/usersettings](https://script.google.com/home/usersettings).
   - Toggle **Google Apps Script API** to **ON**.

---

## 2. Authentication & Initial Clasp Setup

Log in to your Google Account from your terminal:
```bash
clasp login
```
This opens a Google OAuth window in your browser. Accept the requested permissions to allow clasp to manage script projects.

---

## 3. Project Configuration

The `StreamFlow/` directory contains the complete source code and project manifest:

### `StreamFlow/.clasp.json`
```json
{
  "scriptId": "1rMlPDY6udAKnigwoVn0derPBCzBd20CKXPAKshGTSPtuErBycncvqDMe",
  "rootDir": "."
}
```

### `StreamFlow/appsscript.json`
```json
{
  "timeZone": "GMT",
  "dependencies": {
    "enabledAdvancedServices": []
  },
  "webapp": {
    "access": "ANYONE",
    "executeAs": "USER_DEPLOYING"
  },
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/script.send_mail"
  ]
}
```

---

## 4. Deploying the Application

### 4.1 Push Source Files to Google Apps Script
```bash
cd StreamFlow
clasp push -f
```
This pushes all 26 source files (`.gs` and `.html`) to the Google Apps Script cloud project.

### 4.2 Deploy as a Web Application
Deploy a new version to the existing deployment ID:
```bash
clasp deploy -i AKfycbzA2Y70HkzRPG2dznStNi7TLI-Riea0uJP7iRIYW872p20FfUzetWCFF_xqNYvPz1eqsA -d "StreamFlow_Production_V10"
```

If creating a brand-new deployment:
```bash
clasp deploy --description "StreamFlow Initial Release"
```

Your live Web App URL will follow the format:
```text
https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec
```
*Current Active Deployment:* `AKfycbzA2Y70HkzRPG2dznStNi7TLI-Riea0uJP7iRIYW872p20FfUzetWCFF_xqNYvPz1eqsA @10`

---

## 5. First-Time System Initialization

After pushing code for the first time, initialize the database and Drive folders:

1. Open your project in the Apps Script Editor:
   ```bash
   clasp open
   ```
2. In the toolbar function dropdown, select **`setupStreamFlow`** and click **Run**.
3. Google Apps Script will prompt for **Authorization Required**:
   - Click **Review permissions**.
   - Choose your Google Account.
   - Click **Advanced** → **Go to StreamFlow (unsafe)** → **Allow**.
4. The setup function will automatically:
   - Create the `StreamFlow` Google Drive folder structure (`Channel Logos`, `Website Assets`, `M3U Files`, `Backups`).
   - Create the `StreamFlow Database` Google Sheet with all 8 tables and frozen headers.
   - Register your Google account as the Super Administrator.
   - Seed starter reference categories, countries, and broadcast languages.

---

## 6. Email Service Authorization (Password Resets)

To verify that Google `MailApp` is authorized to dispatch password reset emails:
1. In the Apps Script Editor, select **`authorizeEmailService`** from the function dropdown.
2. Click **Run**.
3. Verify the execution log displays your remaining daily quota:
   ```text
   [Authorization] MailApp is fully authorized! Remaining daily email quota: 100 emails.
   ```

---

## 7. Configuring Script Properties

StreamFlow stores its configuration securely in Google Apps Script Script Properties.

To inspect or update properties in the Apps Script Editor:
1. Navigate to **Project Settings** (gear icon on the left sidebar).
2. Scroll to **Script Properties**.

| Property Key | Type | Description |
|---|---|---|
| `SPREADSHEET_ID` | Internal | The Google Spreadsheet ID of the database. |
| `ROOT_FOLDER_ID` | Internal | Google Drive Folder ID of the root `StreamFlow` folder. |
| `CHANNEL_LOGOS_FOLDER_ID` | Internal | Folder ID for channel logo image uploads. |
| `BACKUPS_FOLDER_ID` | Internal | Folder ID where automated database backups are placed. |
| `ADMIN_EMAILS` | Internal | Comma-separated list of authorized administrator Google emails. |
| `ADMIN_EMAIL` | Internal | Primary administrator login email address. |
| `ADMIN_PASSWORD_HASH` | Secret | Salted SHA-256 hash of the administrator password. |
| `ADMIN_2FA_PIN` | Secret | Administrator 2FA security PIN (4–8 digits). |
| `ADMIN_TOKEN_SECRET` | Secret | Cryptographic HMAC secret key used for session signing. |
| `WEB_APP_URL` | Internal | The published Web App `/exec` URL used in reset emails. |

---

## 8. Importing Channels

Administrators can import channels in two ways:

1. **Via the Admin Web Interface:**
   - Log in via the **Admin** button (enter email, password, and 2FA PIN).
   - Navigate to the **Import M3U** tab.
   - Option A: Paste a remote playlist URL (e.g., `https://iptv-org.github.io/iptv/index.m3u`) and click **Direct Import from URL** (imports 10,000+ channels in batches of 2,500).
   - Option B: Drag and drop an `.m3u` file to preview and selectively import channels.

2. **Directly in Google Sheets:**
   - Open the `StreamFlow Database` spreadsheet in Google Drive.
   - Paste rows directly into the `Channels` sheet following the schema columns.
