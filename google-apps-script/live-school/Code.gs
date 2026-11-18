
/**
 * ASTRA Zero-Cost Google Monitor
 * Runs under the user's own Google account. No external server or billing account.
 * Stores event metadata in a private Google Sheet in the same account.
 */


const ASTRA = {
  accountId: "school",
  accountType: "school",
  enabledProviders: ["classroom", "gmail", "drive"],

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
    const runners = { classroom: syncClassroom_, gmail: syncGmail_, drive: syncDrive_ };
    const results = ASTRA.enabledProviders.map(function(provider) {
      if (!runners[provider]) throw new Error("Unknown provider: " + provider);
      return runProviderSafely_(provider, function() { return runners[provider](true); });
    });
    const processing = runProviderSafely_("eventProcessor", processAstraEventsUnlocked_);
    const summary = { event: "astra_monitoring_cycle", results: results, processing: processing };
    Logger.log(JSON.stringify(summary));
    return summary;
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

function syncClassroom_(unlocked) {
  const courses = astraListAll_(
    "https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE&pageSize=" + ASTRA.maxCourses, "courses");
  const items = [];

  courses.forEach(function (course) {
    if (!course.id) return;
    const url = "https://classroom.googleapis.com/v1/courses/" +
      encodeURIComponent(course.id) + "/courseWork?pageSize=" + ASTRA.maxCourseWorkPerCourse;
    astraListAll_(url, "courseWork").forEach(function (work) {
      if (!work.id) return;
      items.push({
        id: course.id + ":" + work.id,
        title: work.title || "Trabalho sem título",
        detail: course.name || "Curso",
        revision: JSON.stringify([work.title || "", work.description || "", work.state || "",
          work.dueDate || null, work.dueTime || null, work.updateTime || ""]),
        createdAt: work.creationTime || "",
        url: work.alternateLink || ""
      });
    });
  });
  return unlocked === true ? recordAstraItemsUnlocked_("classroom", items) : recordNewItems_("classroom", items);
};
function syncGmail_(unlocked) {
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
      revision: JSON.stringify((metadata.labelIds || []).slice().sort()),
      title: subject,
      detail: from,
      createdAt: metadata.internalDate ? new Date(Number(metadata.internalDate)).toISOString() : "",
      url: "https://mail.google.com/mail/u/0/#all/" + message.id
    });
  });

  return unlocked === true ? recordAstraItemsUnlocked_("gmail", items) : recordNewItems_("gmail", items);
}

function syncDrive_(unlocked) {
  const query = encodeURIComponent("trashed = false");
  const fields = encodeURIComponent("files(id,name,mimeType,modifiedTime,webViewLink),nextPageToken");
  const response = googleGet_(
    "https://www.googleapis.com/drive/v3/files?pageSize=" + ASTRA.maxDriveFiles +
    "&orderBy=modifiedTime%20desc&q=" + query + "&fields=" + fields
  );

  const items = (response.files || []).filter(function (file) {
    return Boolean(file.id) && file.id !== PropertiesService.getScriptProperties().getProperty(ASTRA.spreadsheetProperty);
  }).map(function (file) {
    return {
      id: file.id,
      title: file.name || "Ficheiro sem nome",
      detail: file.mimeType || "",
      revision: JSON.stringify([file.name || "", file.mimeType || "", file.modifiedTime || ""]),
      createdAt: file.modifiedTime || "",
      url: file.webViewLink || ""
    };
  });

  return unlocked === true ? recordAstraItemsUnlocked_("drive", items) : recordNewItems_("drive", items);
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
      throw new Error("Existing ASTRA spreadsheet unavailable; destination preserved.");
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
};

/**
 * ASTRA — Classroom Monitor Diagnostic
 * Checks the return value from the existing monitor.
 */

function testAstraClassroomMonitorReturn() {
  const result = syncClassroom_();

  const diagnostic = {
    event: "astra_classroom_monitor_diagnostic",
    returnType: typeof result,
    hasResult: result !== undefined && result !== null,
    baseline: result ? result.baseline : null,
    scanned: result ? result.scanned : null,
    newEvents: result ? result.newEvents : null
  };

  Logger.log(JSON.stringify(diagnostic));

  if (!diagnostic.hasResult) {
    throw new Error(
      "Classroom monitor returned no result."
    );
  }

  return diagnostic;
}


/** v0.9: lock direct monitor/diagnostic calls as well as scheduled cycles. */
function recordNewItems_(provider, items) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error("ASTRA recorder busy");
  try { return recordAstraItemsUnlocked_(provider, items); }
  finally { lock.releaseLock(); }
}

function astraHash_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value,
    Utilities.Charset.UTF_8).map(function(b) {
      return ("0" + (b & 255).toString(16)).slice(-2);
    }).join("");
}

// Append-only snapshots: never replace or clear an existing baseline.
// Events are committed first; deterministic transition keys reconcile retries.
function recordAstraItemsUnlocked_(provider, items) {
  const properties = PropertiesService.getScriptProperties();
  const stored = properties.getProperty("ASTRA_SEEN_" + provider.toUpperCase());
  const legacy = stored === null ? [] : JSON.parse(stored);
  if (!Array.isArray(legacy)) throw new Error("Invalid legacy baseline");
  const seen = new Set(legacy.map(String));
  const spreadsheet = getOrCreateEventsSpreadsheet_();
  const events = spreadsheet.getSheetByName("Events");
  const expected = ["Detected at", "Provider", "Title", "Metadata", "External ID", "Source date", "Open"];
  if (!events || JSON.stringify(events.getRange(1,1,1,7).getValues()[0]) !== JSON.stringify(expected)) {
    throw new Error("Unexpected Events schema; no data migrated");
  }
  const extra = events.getRange(1,8,1,2).getValues()[0];
  if (extra.some(function(v,i) { return v && v !== ["Event key", "Change type"][i]; })) {
    throw new Error("Events extension columns occupied");
  }
  events.getRange(1,8,1,2).setValues([["Event key", "Change type"]]);
  let state = spreadsheet.getSheetByName("MonitorStateV09");
  const header = ["Provider", "External ID", "Revision", "Fingerprint"];
  if (!state) {
    state = spreadsheet.insertSheet("MonitorStateV09");
    state.appendRow(header);
  }
  if (JSON.stringify(state.getRange(1,1,1,4).getValues()[0]) !== JSON.stringify(header)) {
    throw new Error("Unexpected MonitorStateV09 schema");
  }
  const latest = new Map();
  let initialized = false;
  if (state.getLastRow() > 1) state.getRange(2,1,state.getLastRow()-1,4).getValues().forEach(function(r) {
    if (r[0] === provider && r[1] === "") initialized = true;
    if (r[0] === provider && r[1] !== "") {
      if (!Number.isInteger(Number(r[2])) || Number(r[2]) < 0 || !/^[a-f0-9]{64}$/.test(String(r[3]))) {
        throw new Error("Invalid durable monitor state; no automatic reset");
      }
      latest.set(String(r[1]), { revision: Number(r[2]), fingerprint: String(r[3]) });
    }
  });
  const initialBaseline = stored === null && !initialized;
  const keys = new Set();
  if (events.getLastRow() > 1) events.getRange(2,1,events.getLastRow()-1,9).getValues().forEach(function(r) {
    if (r[1] === provider) {
      seen.add(String(r[4]));
      if (r[7]) keys.add(String(r[7]));
    }
  });
  const ids = new Set();
  items.forEach(function(item) {
    if (!item.id || ids.has(String(item.id))) throw new Error("Missing or duplicate resource ID");
    ids.add(String(item.id));
  });
  let emitted = 0, recovered = 0, changed = 0;
  items.forEach(function(item) {
    const id = String(item.id);
    const fingerprint = astraHash_(JSON.stringify([item.title || "", item.detail || "",
      item.createdAt || "", item.url || "", item.revision || ""]));
    const previous = latest.get(id);
    if (previous && previous.fingerprint === fingerprint) return;
    const revision = previous ? previous.revision + 1 : 0;
    const key = astraHash_(JSON.stringify([ASTRA.accountId, provider, id, revision, fingerprint]));
    const isEvent = keys.has(key) || (!initialBaseline && (Boolean(previous) || !seen.has(id)));
    if (isEvent) {
      if (!keys.has(key)) {
        events.getRange(events.getLastRow()+1,1,1,9).setValues([[
          new Date(), provider, astraSheetText_(item.title), astraSheetText_(item.detail), id,
          item.createdAt || "", astraSheetText_(item.url), key, previous ? "updated" : "created"
        ]]);
        SpreadsheetApp.flush();
        keys.add(key);
        emitted++;
        if (previous) changed++;
      } else recovered++;
    }
    state.getRange(state.getLastRow()+1,1,1,4).setValues([[provider,id,revision,fingerprint]]);
    SpreadsheetApp.flush();
    latest.set(id, { revision: revision, fingerprint: fingerprint });
  });
  if (!initialized) {
    state.getRange(state.getLastRow()+1,1,1,4).setValues([[provider,"",-1,"initialized"]]);
    SpreadsheetApp.flush();
  }
  // Legacy IDs intentionally remain untouched. New durable state replaces the bounded cache.
  return { baseline: initialBaseline,
    scanned: items.length, newEvents: emitted, changedEvents: changed, recoveredEvents: recovered };
}

function astraSheetText_(value) {
  const text = String(value || "");
  return /^[=+@-]/.test(text) ? "'" + text : text;
}

function astraListAll_(url, field) {
  const items = [];
  let token = "";
  const tokens = new Set();
  for (let page = 0; page < 10; page++) {
    const response = googleGet_(url + (token ? "&pageToken=" + encodeURIComponent(token) : ""));
    Array.prototype.push.apply(items, response[field] || []);
    token = response.nextPageToken || "";
    if (!token) return items;
    if (tokens.has(token)) throw new Error("Repeated pagination token");
    tokens.add(token);
  }
  throw new Error("Classroom pagination budget exceeded; baseline unchanged");
}

// Explicit manual validation only. Never called by the scheduled cycle.
function validateAstraV09Live() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(ASTRA.spreadsheetProperty);
  if (!id) throw new Error("Missing existing spreadsheet configuration");
  const before = ASTRA.enabledProviders.map(function(p) {
    return props.getProperty("ASTRA_SEEN_" + p.toUpperCase());
  });
  const source = SpreadsheetApp.openById(id);
  const backup = source.copy("ASTRA backup before v0.9 validation " + new Date().toISOString());
  Logger.log(JSON.stringify({event:"astra_v09_backup",url:backup.getUrl()}));
  testAstraDeadlinePriority();
  testAstraClassroomActionEngine();
  const first = runMonitoringCycle();
  const second = runMonitoringCycle();
  const preserved = ASTRA.enabledProviders.every(function(p,i) {
    return props.getProperty("ASTRA_SEEN_" + p.toUpperCase()) === before[i];
  });
  const summary = {event:"astra_v09_live_validation",baselinesPreserved:preserved,first:first,second:second};
  Logger.log(JSON.stringify(summary));
  if (!preserved) throw new Error("Legacy baseline unexpectedly changed");
  return summary;
}

// Read-only verification of the backup file used for the v0.9 rename test.
function inspectAstraV09TestEvent() {
  const id = PropertiesService.getScriptProperties().getProperty(ASTRA.spreadsheetProperty);
  if (!id) throw new Error("Missing existing spreadsheet");
  const book = SpreadsheetApp.openById(id);
  const events = book.getSheetByName("Events");
  const processing = book.getSheetByName("EventProcessing");
  const rows = events.getLastRow() > 1 ? events.getRange(2,1,events.getLastRow()-1,9).getValues() : [];
  const classified = processing && processing.getLastRow() > 1 ? processing.getRange(2,2,processing.getLastRow()-1,1).getValues() : [];
  const keys = new Set(classified.map(function(r) { return String(r[0]); }));
  const matches = rows.filter(function(r) { return r[1] === "drive" && String(r[4]) === "1k_t0BZISbL1sCjjYGrRYAD5oyQh0ynevZQKVg6q8e3w"; });
  const updates = matches.filter(function(r) { return r[8] === "updated"; });
  const result = {event:"astra_v09_controlled_change", matchingEvents:matches.length,
    updatedEvents:updates.length, classifiedUpdates:updates.filter(function(r) { return keys.has(String(r[7])); }).length,
    uniqueUpdateKeys:new Set(updates.map(function(r) { return String(r[7]); })).size,
    spreadsheetUrl:book.getUrl()};
  Logger.log(JSON.stringify(result));
  return result;
}
