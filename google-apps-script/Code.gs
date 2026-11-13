/**
 * ASTRA Zero-Cost Google Monitor
 * Runs under the user's own Google account. No external server or billing account.
 * Stores event metadata in a private Google Sheet in the same account.
 */

const ASTRA = {
  spreadsheetProperty: "ASTRA_EVENTS_SPREADSHEET_ID",
  triggerHandler: "runMonitoringCycle",
  maxCourses: 20,
  maxCourseWorkPerCourse: 50,
  maxGmailMessages: 50,
  maxDriveFiles: 50,
  seenLimit: 2000
};

function setupAstraMonitoring() {
  const spreadsheet = getOrCreateEventsSpreadsheet_();
  ScriptApp.getProjectTriggers()
    .filter(function (trigger) {
      return trigger.getHandlerFunction() === ASTRA.triggerHandler;
    })
    .forEach(function (trigger) {
      ScriptApp.deleteTrigger(trigger);
    });

  ScriptApp.newTrigger(ASTRA.triggerHandler).timeBased().everyMinutes(15).create();
  Logger.log("ASTRA monitoring configured. Events sheet: " + spreadsheet.getUrl());
  Logger.log("Run runMonitoringCycle once manually to establish the initial baseline.");
}

function stopAstraMonitoring() {
  ScriptApp.getProjectTriggers()
    .filter(function (trigger) {
      return trigger.getHandlerFunction() === ASTRA.triggerHandler;
    })
    .forEach(function (trigger) {
      ScriptApp.deleteTrigger(trigger);
    });
  Logger.log("ASTRA monitoring trigger removed. Existing events and spreadsheet were kept.");
}

function runMonitoringCycle() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    Logger.log("A monitoring cycle is already running; skipping this execution.");
    return;
  }

  try {
    getOrCreateEventsSpreadsheet_();
    const results = [
      runProviderSafely_("classroom", syncClassroom_),
      runProviderSafely_("gmail", syncGmail_),
      runProviderSafely_("drive", syncDrive_)
    ];
    Logger.log(JSON.stringify({ event: "astra_monitoring_cycle", results: results }));
  } finally {
    lock.releaseLock();
  }
}

function runProviderSafely_(provider, syncFunction) {
  try {
    return { provider: provider, result: syncFunction() };
  } catch (error) {
    console.error("ASTRA provider error (" + provider + "): " + error.message);
    return { provider: provider, error: String(error.message || error) };
  }
}

function syncClassroom_() {
  const coursesResponse = googleGet_(
    "https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE&pageSize=" + ASTRA.maxCourses
  );
  const courses = coursesResponse.courses || [];
  const items = [];

  courses.forEach(function (course) {
    if (!course.id) return;
    const url = "https://classroom.googleapis.com/v1/courses/" +
      encodeURIComponent(course.id) + "/courseWork?pageSize=" + ASTRA.maxCourseWorkPerCourse;
    const response = googleGet_(url);
    (response.courseWork || []).forEach(function (work) {
      if (!work.id) return;
      items.push({
        id: course.id + ":" + work.id,
        title: work.title || "Trabalho sem título",
        detail: course.name || "Curso",
        createdAt: work.creationTime || "",
        url: work.alternateLink || ""
      });
    });
  });

  return recordNewItems_("classroom", items);
}

function syncGmail_() {
  // Gmail metadata scope permits listing by system label and reading message headers,
  // without downloading message bodies or attachments.
  const list = googleGet_(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=IMPORTANT&maxResults=" +
      ASTRA.maxGmailMessages
  );
  const messages = list.messages || [];
  const items = [];

  messages.forEach(function (message) {
    if (!message.id) return;
    const metadata = googleGet_(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/" +
      encodeURIComponent(message.id) +
      "?format=metadata&metadataHeaders=Subject&metadataHeaders=From"
    );
    const headers = (metadata.payload && metadata.payload.headers) || [];
    const subject = findHeader_(headers, "subject") || "Email importante";
    const from = findHeader_(headers, "from") || "";
    items.push({
      id: message.id,
      title: subject,
      detail: from,
      createdAt: metadata.internalDate ? new Date(Number(metadata.internalDate)).toISOString() : "",
      url: "https://mail.google.com/mail/u/0/#all/" + message.id
    });
  });

  return recordNewItems_("gmail", items);
}

function syncDrive_() {
  const query = encodeURIComponent("trashed = false");
  const fields = encodeURIComponent("files(id,name,mimeType,modifiedTime,webViewLink),nextPageToken");
  const response = googleGet_(
    "https://www.googleapis.com/drive/v3/files?pageSize=" + ASTRA.maxDriveFiles +
    "&orderBy=modifiedTime%20desc&q=" + query + "&fields=" + fields
  );

  const items = (response.files || []).filter(function (file) {
    return Boolean(file.id);
  }).map(function (file) {
    return {
      id: file.id,
      title: file.name || "Ficheiro sem nome",
      detail: file.mimeType || "",
      createdAt: file.modifiedTime || "",
      url: file.webViewLink || ""
    };
  });

  return recordNewItems_("drive", items);
}

function recordNewItems_(provider, items) {
  const properties = PropertiesService.getScriptProperties();
  const propertyKey = "ASTRA_SEEN_" + provider.toUpperCase();
  const stored = properties.getProperty(propertyKey);

  const currentIds = items.map(function (item) { return item.id; });
  if (stored === null) {
    properties.setProperty(propertyKey, JSON.stringify(currentIds.slice(-ASTRA.seenLimit)));
    Logger.log(provider + ": initial baseline created (" + currentIds.length + " IDs); no historical alerts emitted.");
    return { baseline: true, scanned: items.length, newEvents: 0 };
  }

  const seen = new Set(JSON.parse(stored));
  const fresh = items.filter(function (item) { return !seen.has(item.id); });
  const updatedIds = Array.from(new Set(Array.from(seen).concat(currentIds))).slice(-ASTRA.seenLimit);
  properties.setProperty(propertyKey, JSON.stringify(updatedIds));

  if (fresh.length) appendEvents_(provider, fresh);
  return { baseline: false, scanned: items.length, newEvents: fresh.length };
}

function appendEvents_(provider, items) {
  const sheet = getOrCreateEventsSpreadsheet_().getSheetByName("Events");
  const timestamp = new Date();
  const rows = items.map(function (item) {
    return [
      timestamp,
      provider,
      item.title || "",
      item.detail || "",
      item.id,
      item.createdAt || "",
      item.url || ""
    ];
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function getOrCreateEventsSpreadsheet_() {
  const properties = PropertiesService.getScriptProperties();
  const existingId = properties.getProperty(ASTRA.spreadsheetProperty);
  if (existingId) {
    try {
      return SpreadsheetApp.openById(existingId);
    } catch (error) {
      console.warn("Stored ASTRA spreadsheet was unavailable; creating a replacement.");
    }
  }

  const spreadsheet = SpreadsheetApp.create("ASTRA — Monitoring Events");
  const sheet = spreadsheet.getSheets()[0];
  sheet.setName("Events");
  sheet.appendRow(["Detected at", "Provider", "Title", "Metadata", "External ID", "Source date", "Open"]);
  sheet.setFrozenRows(1);
  properties.setProperty(ASTRA.spreadsheetProperty, spreadsheet.getId());
  return spreadsheet;
}

function findHeader_(headers, name) {
  const header = headers.find(function (item) {
    return String(item.name || "").toLowerCase() === name;
  });
  return header ? header.value : "";
}

function googleGet_(url) {
  const response = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  const status = response.getResponseCode();
  const body = response.getContentText();
  if (status < 200 || status >= 300) {
    throw new Error("Google API returned HTTP " + status + ": " + body.slice(0, 500));
  }
  return body ? JSON.parse(body) : {};
}
