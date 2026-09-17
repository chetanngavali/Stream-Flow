/**
 * StreamFlow - Drive Integration Service
 * Manages Google Drive folder hierarchy, assets, logo uploads, and backups.
 */

/**
 * Initializes the StreamFlow Google Drive folder hierarchy idempotently.
 * Updates Script Properties with the generated or located Folder IDs.
 * @return {Object} Folder IDs map
 */
function initializeDriveFolders() {
  let rootFolder;
  const rootId = getScriptProperty_(CONFIG.PROPERTY_KEYS.ROOT_FOLDER_ID);

  if (rootId) {
    try {
      rootFolder = DriveApp.getFolderById(rootId);
    } catch (e) {
      console.log('Stored ROOT_FOLDER_ID invalid or inaccessible. Creating/locating fresh root.');
    }
  }

  if (!rootFolder) {
    const existing = DriveApp.getFoldersByName(CONFIG.DRIVE_FOLDERS.ROOT);
    if (existing.hasNext()) {
      rootFolder = existing.next();
    } else {
      rootFolder = DriveApp.createFolder(CONFIG.DRIVE_FOLDERS.ROOT);
    }
    setScriptProperty_(CONFIG.PROPERTY_KEYS.ROOT_FOLDER_ID, rootFolder.getId());
  }

  // Create or verify subfolders
  const folderKeyMapping = {
    [CONFIG.DRIVE_FOLDERS.LOGOS]: CONFIG.PROPERTY_KEYS.CHANNEL_LOGOS_FOLDER_ID,
    [CONFIG.DRIVE_FOLDERS.ASSETS]: CONFIG.PROPERTY_KEYS.WEBSITE_ASSETS_FOLDER_ID,
    [CONFIG.DRIVE_FOLDERS.M3U]: CONFIG.PROPERTY_KEYS.M3U_FOLDER_ID,
    [CONFIG.DRIVE_FOLDERS.BACKUPS]: CONFIG.PROPERTY_KEYS.BACKUPS_FOLDER_ID
  };

  const results = { rootId: rootFolder.getId() };

  Object.keys(CONFIG.DRIVE_FOLDERS).forEach(key => {
    if (key === 'ROOT') return;
    const subfolderName = CONFIG.DRIVE_FOLDERS[key];
    let subfolder;

    const subExisting = rootFolder.getFoldersByName(subfolderName);
    if (subExisting.hasNext()) {
      subfolder = subExisting.next();
    } else {
      subfolder = rootFolder.createFolder(subfolderName);
    }

    const propKey = folderKeyMapping[subfolderName];
    if (propKey) {
      setScriptProperty_(propKey, subfolder.getId());
      results[propKey] = subfolder.getId();
    }
  });

  return results;
}

/**
 * Uploads a channel logo image to the Channel Logos folder.
 * Requires admin authorization. Strictly restricts MIME types to raster formats
 * to prevent SVG XSS and enforces a 3MB file size limit.
 * @param {string} fileName
 * @param {string} base64Data
 * @param {string} mimeType
 * @param {string} [token]
 * @return {string} Direct public image URL
 */
function uploadChannelLogo(fileName, base64Data, mimeType = 'image/png', token) {
  requireAdmin(token);
  if (!fileName || !base64Data) {
    throw new Error('File name and base64 data are required.');
  }

  // Strictly disallow SVG to prevent embedded XML script execution
  const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  const cleanMime = String(mimeType).toLowerCase().trim();
  if (!allowedTypes.includes(cleanMime)) {
    throw new Error('Invalid image type. Only PNG, JPEG, and WebP images are permitted.');
  }

  const logoFolderId = getScriptProperty_(CONFIG.PROPERTY_KEYS.CHANNEL_LOGOS_FOLDER_ID);
  let folder;
  if (logoFolderId) {
    try {
      folder = DriveApp.getFolderById(logoFolderId);
    } catch (e) {}
  }

  if (!folder) {
    const folders = initializeDriveFolders();
    folder = DriveApp.getFolderById(folders[CONFIG.PROPERTY_KEYS.CHANNEL_LOGOS_FOLDER_ID]);
  }

  // Clean base64 string
  let cleanBase64 = base64Data;
  if (cleanBase64.includes(',')) {
    cleanBase64 = cleanBase64.split(',')[1];
  }

  const decodedBytes = Utilities.base64Decode(cleanBase64);

  // Maximum file size limit: 3MB
  const MAX_BYTES = 3 * 1024 * 1024;
  if (decodedBytes.length > MAX_BYTES) {
    throw new Error('Logo image file exceeds the 3MB size limit.');
  }

  // Sanitize filename to prevent path traversal or special characters
  const cleanFileName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 80) || 'logo.png';
  const blob = Utilities.newBlob(decodedBytes, cleanMime, cleanFileName);
  const file = folder.createFile(blob);

  // Set file sharing to viewer with link so browsers can render the logo
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // Generate public view link
  const fileId = file.getId();
  const directUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;

  recordActivity('UPLOAD_LOGO', '', `Uploaded logo: ${cleanFileName} (${fileId})`);
  return directUrl;
}

/**
 * Creates an automated timestamped backup copy of the StreamFlow Database in the Backups folder.
 * Requires admin authorization.
 * @param {string} [token]
 * @return {string} Backup URL
 */
function createDatabaseBackup(token) {
  requireAdmin(token);

  const backupFolderId = getScriptProperty_(CONFIG.PROPERTY_KEYS.BACKUPS_FOLDER_ID);
  let folder;
  if (backupFolderId) {
    try {
      folder = DriveApp.getFolderById(backupFolderId);
    } catch (e) {}
  }
  if (!folder) {
    const init = initializeDriveFolders();
    folder = DriveApp.getFolderById(init[CONFIG.PROPERTY_KEYS.BACKUPS_FOLDER_ID]);
  }

  const ss = getSpreadsheet();
  const file = DriveApp.getFileById(ss.getId());
  const backupName = `StreamFlow_DB_Backup_${Utilities.formatDate(new Date(), 'GMT', 'yyyyMMdd_HHmmss')}`;
  const backupFile = file.makeCopy(backupName, folder);

  recordActivity('CREATE_BACKUP', '', `Created database backup: ${backupName}`);
  return backupFile.getUrl();
}
