
/**
 * ASTRA — Drive Content Reader
 * Selective content access for Google Drive.
 *
 * Supported:
 * - Google Docs
 * - Google Sheets (CSV export)
 * - PDF
 * - DOCX
 * - TXT, CSV, JSON, HTML, XML, RTF and Markdown
 *
 * Content is never logged or stored automatically.
 */

const ASTRA_DRIVE_CONTENT = {
  maxBytes: 10 * 1024 * 1024,
  maxTextChars: 30000
};

/**
 * Main entry point.
 * Returns extracted text or PDF data ready for Gemini.
 */
function getDriveContentForAI(fileId) {
  if (!fileId || typeof fileId !== "string") {
    throw new Error("A valid Drive file ID is required.");
  }

  const metadata = googleGet_(
    "https://www.googleapis.com/drive/v3/files/" +
    encodeURIComponent(fileId) +
    "?fields=id,name,mimeType,size,modifiedTime,capabilities(canDownload)"
  );

  if (metadata.capabilities &&
      metadata.capabilities.canDownload === false) {
    throw new Error("This file cannot be downloaded.");
  }

  const mime = metadata.mimeType || "";
  const name = metadata.name || "Unnamed file";

  if (mime === "application/vnd.google-apps.document") {
    const text = exportGoogleWorkspaceFile_(fileId, "text/plain");
    return driveTextResult_(metadata, text);
  }

  if (mime === "application/vnd.google-apps.spreadsheet") {
    const text = exportGoogleWorkspaceFile_(fileId, "text/csv");
    return driveTextResult_(metadata, text);
  }

  if (mime === "application/pdf") {
    const blob = downloadDriveFile_(fileId);
    checkDriveFileSize_(blob);

    return {
      success: true,
      kind: "pdf",
      name: name,
      mimeType: mime,
      size: blob.getBytes().length,
      data: Utilities.base64Encode(blob.getBytes())
    };
  }

  if (mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const blob = downloadDriveFile_(fileId);
    checkDriveFileSize_(blob);

    const text = extractDocxText_(blob);
    return driveTextResult_(metadata, text);
  }

  const textTypes = [
    "text/plain",
    "text/csv",
    "text/html",
    "text/xml",
    "application/json",
    "application/rtf",
    "text/markdown"
  ];

  if (textTypes.indexOf(mime) !== -1) {
    const blob = downloadDriveFile_(fileId);
    checkDriveFileSize_(blob);

    return driveTextResult_(
      metadata,
      blob.getDataAsString("UTF-8")
    );
  }

  return {
    success: false,
    kind: "unsupported",
    name: name,
    mimeType: mime,
    reason: "No compatible content extractor is configured."
  };
}

/**
 * Download binary content using Drive API v3.
 */
function downloadDriveFile_(fileId) {
  const url =
    "https://www.googleapis.com/drive/v3/files/" +
    encodeURIComponent(fileId) +
    "?alt=media";

  const response = UrlFetchApp.fetch(url, {
    method: "get",
    headers: {
      Authorization: "Bearer " + ScriptApp.getOAuthToken()
    },
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();

  if (status < 200 || status >= 300) {
    throw new Error(
      "Drive download error (" + status + "): " +
      response.getContentText().slice(0, 500)
    );
  }

  return response.getBlob();
}

/**
 * Export Google Workspace files.
 */
function exportGoogleWorkspaceFile_(fileId, mimeType) {
  const url =
    "https://www.googleapis.com/drive/v3/files/" +
    encodeURIComponent(fileId) +
    "/export?mimeType=" + encodeURIComponent(mimeType);

  const response = UrlFetchApp.fetch(url, {
    method: "get",
    headers: {
      Authorization: "Bearer " + ScriptApp.getOAuthToken()
    },
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();

  if (status < 200 || status >= 300) {
    throw new Error(
      "Drive export error (" + status + "): " +
      response.getContentText().slice(0, 500)
    );
  }

  return response.getContentText("UTF-8");
}

/**
 * Extract text from Microsoft Word DOCX.
 * DOCX is a ZIP archive containing WordprocessingML.
 */

function extractDocxText_(blob) {
  // DOCX is a ZIP archive internally.
  // Normalize its MIME type before extraction.
  const zipBlob = Utilities.newBlob(
    blob.getBytes(),
    "application/zip",
    "document.docx"
  );

  const files = Utilities.unzip(zipBlob);

  const documentFile = files.find(function(file) {
    return file.getName() === "word/document.xml";
  });

  if (!documentFile) {
    throw new Error("DOCX document.xml was not found.");
  }

  const xml = XmlService.parse(
    documentFile.getDataAsString("UTF-8")
  );

  const descendants = xml.getRootElement().getDescendants();

  const text = descendants
    .filter(function(item) {
      return item.getType() === XmlService.ContentTypes.TEXT;
    })
    .map(function(item) {
      return item.getValue();
    })
    .join(" ");

  return text;
}


/**
 * Standardized text result.
 */
function driveTextResult_(metadata, text) {
  const content = String(text || "");

  return {
    success: true,
    kind: "text",
    name: metadata.name || "Unnamed file",
    mimeType: metadata.mimeType || "",
    modifiedTime: metadata.modifiedTime || "",
    truncated: content.length > ASTRA_DRIVE_CONTENT.maxTextChars,
    content: content.slice(0, ASTRA_DRIVE_CONTENT.maxTextChars)
  };
}

/**
 * Protect Apps Script from oversized files.
 */
function checkDriveFileSize_(blob) {
  const size = blob.getBytes().length;

  if (size > ASTRA_DRIVE_CONTENT.maxBytes) {
    throw new Error(
      "File exceeds ASTRA content limit of 10 MB."
    );
  }
}

/**
 * Safe diagnostic test.
 * Does not log document contents or PDF data.
 */
function testDriveContentReader(fileId) {
  const result = getDriveContentForAI(fileId);

  Logger.log(JSON.stringify({
    success: result.success,
    kind: result.kind,
    name: result.name,
    mimeType: result.mimeType,
    size: result.size || null,
    characters: result.content ? result.content.length : null,
    truncated: result.truncated || false,
    reason: result.reason || null
  }));

  return result.success;
};

function testAstraDriveReader() {
  const FILE_ID = "1ayx87ykb3tZ8bCUBdytGWGB0_UHTr7wz";

  return testDriveContentReader(FILE_ID);
}
