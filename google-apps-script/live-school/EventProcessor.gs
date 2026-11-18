
/**
 * ASTRA — Event Processor v0.1
 *
 * Phase 1: Read, normalize and classify monitoring events.
 *
 * Read-only diagnostic mode.
 * Does not call Gemini, modify events or send notifications.
 */

const ASTRA_EVENT_PROCESSOR = {
  sourceSheet: "Events",
  previewLimit: 20,
  allowedProviders: ["classroom", "gmail", "drive"]
};

/**
 * Convert a spreadsheet date to ISO 8601.
 */
function astraEventDate_(value) {
  if (!value) return "";

  if (value instanceof Date) {
    return isNaN(value.getTime())
      ? ""
      : value.toISOString();
  }

  const date = new Date(value);

  return isNaN(date.getTime())
    ? ""
    : date.toISOString();
}

/**
 * Normalize one event from the existing Events sheet.
 */
function normalizeAstraEvent_(row) {
  const provider = String(row[1] || "")
    .trim()
    .toLowerCase();

  const externalId = String(row[4] || "").trim();

  if (
    ASTRA_EVENT_PROCESSOR.allowedProviders.indexOf(provider) === -1 ||
    !externalId
  ) {
    return null;
  }

  return {
    provider: provider,
    externalId: externalId,
    title: String(row[2] || ""),
    metadata: String(row[3] || ""),
    detectedAt: astraEventDate_(row[0]),
    sourceDate: astraEventDate_(row[5]),
    url: String(row[6] || ""),
    category: classifyAstraEvent_(provider),
    priority: prioritizeAstraEvent_(provider)
  };
}

/**
 * Initial classification.
 *
 * This is deterministic classification, not AI analysis.
 */
function classifyAstraEvent_(provider) {
  const categories = {
    classroom: "school_assignment",
    gmail: "important_email",
    drive: "drive_file"
  };

  return categories[provider] || "unknown";
}

/**
 * Initial priority rules.
 *
 * These are provisional priorities, not AI decisions.
 */
function prioritizeAstraEvent_(provider) {
  const priorities = {
    classroom: "high",
    gmail: "high",
    drive: "normal"
  };

  return priorities[provider] || "normal";
}

/**
 * Read and normalize recent events.
 *
 * Does not modify the spreadsheet.
 */
function previewAstraEventProcessing() {
  const spreadsheet = getOrCreateEventsSpreadsheet_();

  const sheet = spreadsheet.getSheetByName(
    ASTRA_EVENT_PROCESSOR.sourceSheet
  );

  if (!sheet) {
    throw new Error("ASTRA Events sheet not found.");
  }

  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    Logger.log(JSON.stringify({
      event: "astra_event_preview",
      status: "empty",
      scanned: 0,
      valid: 0
    }));
    return;
  }

  const count = Math.min(
    lastRow - 1,
    ASTRA_EVENT_PROCESSOR.previewLimit
  );

  const startRow = lastRow - count + 1;

  const rows = sheet
    .getRange(startRow, 1, count, 7)
    .getValues();

  const events = rows
    .map(normalizeAstraEvent_)
    .filter(function(event) {
      return event !== null;
    });

  const summary = {
    event: "astra_event_preview",
    status: "success",
    scanned: rows.length,
    valid: events.length,
    invalid: rows.length - events.length,
    providers: {},
    priorities: {}
  };

  events.forEach(function(event) {
    summary.providers[event.provider] =
      (summary.providers[event.provider] || 0) + 1;

    summary.priorities[event.priority] =
      (summary.priorities[event.priority] || 0) + 1;
  });

  // Only aggregated metadata is logged.
  Logger.log(JSON.stringify(summary));

  return summary;
};

/**
 * ASTRA — Event Processor v0.2
 * Persistent event classification and deduplication.
 *
 * Does not modify the Events sheet.
 * Does not call Gemini or send notifications.
 */

function astraEventKey_(row, sourceRow) {
  if (row[7]) return String(row[7]);
  const identity = JSON.stringify([
    sourceRow,
    String(row[1] || "").trim().toLowerCase(),
    String(row[4] || "").trim()
  ]);

  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    identity,
    Utilities.Charset.UTF_8
  );

  return digest.map(function(byte) {
    return ("0" + (byte & 255).toString(16)).slice(-2);
  }).join("");
}

function processAstraEvents() {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(1000)) {
    Logger.log("ASTRA EventProcessor: another cycle is running.");
    return;
  }

  try { return processAstraEventsUnlocked_(); }
  finally { lock.releaseLock(); }
}

// Caller must hold the script lock; avoids reacquiring it inside monitoring.
function processAstraEventsUnlocked_() {
    const spreadsheet = getOrCreateEventsSpreadsheet_();
    const source = spreadsheet.getSheetByName("Events");

    if (!source) {
      throw new Error("Events sheet not found.");
    }

    let target = spreadsheet.getSheetByName("EventProcessing");

    if (!target) {
      target = spreadsheet.insertSheet("EventProcessing");
      target.appendRow([
        "Processed at",
        "Event key",
        "Provider",
        "Category",
        "Priority",
        "Source row",
        "Status"
      ]);
      target.setFrozenRows(1);
    }

    const existingKeys = new Set();

    if (target.getLastRow() > 1) {
      target.getRange(
        2, 2, target.getLastRow() - 1, 1
      ).getValues().forEach(function(row) {
        existingKeys.add(String(row[0]));
      });
    }

    const total = Math.max(0, source.getLastRow() - 1);
    const limit = 20;
    const newRows = [];

    let alreadyProcessed = 0;
    let invalid = 0;

    if (total > 0) {
      const rows = source
        .getRange(2, 1, total, 9)
        .getValues();

      for (let i = 0; i < rows.length; i++) {
        const event = normalizeAstraEvent_(rows[i]);

        if (!event) {
          invalid++;
          continue;
        }

        const sourceRow = i + 2;
        const key = astraEventKey_(rows[i], sourceRow);

        if (existingKeys.has(key)) {
          alreadyProcessed++;
          continue;
        }

        newRows.push([
          new Date(),
          key,
          event.provider,
          event.category,
          event.priority,
          sourceRow,
          "classified"
        ]);

        existingKeys.add(key);

        if (newRows.length >= limit) break;
      }
    }

    if (newRows.length) {
      target.getRange(
        target.getLastRow() + 1,
        1,
        newRows.length,
        7
      ).setValues(newRows);

      SpreadsheetApp.flush();
    }

    const summary = {
      event: "astra_event_processing",
      status: "success",
      totalSourceEvents: total,
      newlyClassified: newRows.length,
      alreadyClassified: alreadyProcessed,
      invalid: invalid,
      batchLimit: limit
    };

    // Telegram stays disabled unless explicitly activated in Script Properties.
    // Failure is isolated: committed monitoring/classification results remain valid.
    if (PropertiesService.getScriptProperties().getProperty('ASTRA_TELEGRAM_ENABLED') === 'true') {
      try { summary.telegram = astraDispatchTelegramUnlocked_(); }
      catch (_) {
        summary.telegram = {status:'error',requiresReview:true};
        console.warn('ASTRA Telegram delivery requires review; monitoring preserved.');
      }
    }
    Logger.log(JSON.stringify(summary));
    return summary;

}

/**
 * ASTRA EventProcessor v0.3
 * Isolated Gemini analysis test.
 * Uses synthetic data only.
 */

function testAstraEventIntelligence() {
  const apiKey = PropertiesService
    .getScriptProperties()
    .getProperty("GEMINI_API_KEY");

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured.");
  }

  const testEvent = {
    provider: "classroom",
    category: "school_assignment",
    title: "Exercício de programação JavaScript",
    description: "Criar uma função para ordenar números.",
    dueDate: "2026-11-18T23:59:00Z"
  };


  const now = new Date();

  const prompt =
    "És o motor de análise de eventos do ASTRA.\n" +
    "A data e hora atual, em UTC, é: " +
    now.toISOString() + "\n\n" +

    "Analisa exclusivamente os dados fornecidos.\n" +
    "Calcula o tempo restante até ao prazo usando " +
    "a data atual indicada acima.\n" +
    "Não inventes datas nem informações.\n" +

    "Regras de prioridade para tarefas com prazo:\n" +
    "- Prazo ultrapassado: high.\n" +
    "- Prazo em menos de 48 horas: high.\n" +
    "- Prazo entre 48 horas e 7 dias: normal.\n" +
    "- Prazo superior a 7 dias: low.\n\n" +

    "Para eventos sem prazo, não inventes um.\n" +
    "Responde em português de Portugal.\n" +
    "Devolve apenas JSON válido com os campos:\n" +
    "summary, priority, recommendedAction, reason.\n" +
    "priority deve ser high, normal ou low.\n" +

    "Evento:\n" + JSON.stringify(testEvent);


  const url = ASTRA_AI.endpoint +
    ASTRA_AI.model + ":generateContent";

  const response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: {
      "x-goog-api-key": apiKey
    },
    payload: JSON.stringify({
      contents: [{
        role: "user",
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
        responseMimeType: "application/json"
      }
    }),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  const raw = response.getContentText();

  if (status < 200 || status >= 300) {
    throw new Error(
      "Gemini event analysis failed (" + status + "): " +
      raw.slice(0, 1000)
    );
  }

  const data = JSON.parse(raw);
  const parts = (
    data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    data.candidates[0].content.parts
  ) || [];

  const text = parts
    .filter(function(part) {
      return typeof part.text === "string";
    })
    .map(function(part) {
      return part.text;
    })
    .join("");

  if (!text) {
    throw new Error("Gemini returned no analysis text.");
  }

  const analysis = JSON.parse(text);

  const required = [
    "summary",
    "priority",
    "recommendedAction",
    "reason"
  ];

  required.forEach(function(field) {
    if (
      typeof analysis[field] !== "string" ||
      !analysis[field].trim()
    ) {
      throw new Error("Invalid analysis field: " + field);
    }
  });

  if (
    ["high", "normal", "low"]
      .indexOf(analysis.priority) === -1
  ) {
    throw new Error("Invalid priority value.");
  }

  Logger.log(JSON.stringify({
    event: "astra_intelligence_test",
    status: "success",
    model: ASTRA_AI.model,
    analysis: analysis
  }));

  return analysis;
};

/**
 * ASTRA — Temporal Priority Engine v0.4
 *
 * Deterministic deadline classification.
 * No Gemini calls, Sheets writes or notifications.
 */

function calculateAstraDeadlinePriority_(dueDate, now) {
  if (!dueDate) {
    return {
      priority: null,
      status: "no_deadline",
      hoursRemaining: null
    };
  }

  const deadline = new Date(dueDate);
  const current = now ? new Date(now) : new Date();

  if (
    !Number.isFinite(deadline.getTime()) ||
    !Number.isFinite(current.getTime())
  ) {
    throw new Error("Invalid deadline or current date.");
  }

  const hours = (
    deadline.getTime() - current.getTime()
  ) / (1000 * 60 * 60);

  let priority;
  let status;

  if (hours <= 0) {
    priority = "high";
    status = "overdue";
  } else if (hours < 48) {
    priority = "high";
    status = "urgent";
  } else if (hours <= 168) {
    priority = "normal";
    status = "upcoming";
  } else {
    priority = "low";
    status = "scheduled";
  }

  return {
    priority: priority,
    status: status,
    hoursRemaining: Math.round(hours * 100) / 100
  };
}

/**
 * Test priority rules against fixed timestamps.
 */
function testAstraDeadlinePriority() {
  const now = "2026-11-14T14:00:00Z";

  const cases = [
    {
      name: "Overdue",
      due: "2026-11-13T14:00:00Z",
      expected: "high"
    },
    {
      name: "Urgent",
      due: "2026-11-15T14:00:00Z",
      expected: "high"
    },
    {
      name: "Upcoming",
      due: "2026-11-18T23:59:00Z",
      expected: "normal"
    },
    {
      name: "Scheduled",
      due: "2026-11-30T14:00:00Z",
      expected: "low"
    }
  ];

  const results = cases.map(function(item) {
    const result = calculateAstraDeadlinePriority_(
      item.due,
      now
    );

    return {
      test: item.name,
      expected: item.expected,
      actual: result.priority,
      passed: result.priority === item.expected
    };
  });

  const passed = results.every(function(item) {
    return item.passed;
  });

  Logger.log(JSON.stringify({
    event: "astra_deadline_priority_test",
    success: passed,
    results: results
  }));

  if (!passed) {
    throw new Error("ASTRA deadline priority tests failed.");
  }

  return passed;
};

/**
 * ASTRA — Classroom Deadline Diagnostic v0.4
 * Read-only test using real Classroom deadlines.
 */

function getAstraClassroomDueDate_(work) {
  if (!work.dueDate) return null;

  const d = work.dueDate;
  const t = work.dueTime || {
    hours: 23,
    minutes: 59,
    seconds: 0
  };

  const date = new Date(Date.UTC(
    Number(d.year),
    Number(d.month) - 1,
    Number(d.day),
    Number(t.hours || 0),
    Number(t.minutes || 0),
    Number(t.seconds || 0)
  ));

  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() !== Number(d.year) ||
    date.getUTCMonth() !== Number(d.month) - 1 ||
    date.getUTCDate() !== Number(d.day)
  ) {
    throw new Error("Invalid Classroom deadline.");
  }

  return date.toISOString();
}

function testAstraClassroomDeadlines() {
  const courses = googleGet_(
    "https://classroom.googleapis.com/v1/courses" +
    "?courseStates=ACTIVE&pageSize=" + ASTRA.maxCourses
  ).courses || [];

  const summary = {
    event: "astra_classroom_deadline_test",
    coursesScanned: 0,
    tasksScanned: 0,
    tasksWithDeadline: 0,
    tasksWithoutDeadline: 0,
    priorities: {
      high: 0,
      normal: 0,
      low: 0
    },
    deadlineStatus: {
      overdue: 0,
      urgent: 0,
      upcoming: 0,
      scheduled: 0
    }
  };

  const now = new Date();

  courses.forEach(function(course) {
    if (!course.id) return;

    const url =
      "https://classroom.googleapis.com/v1/courses/" +
      encodeURIComponent(course.id) +
      "/courseWork?pageSize=" +
      ASTRA.maxCourseWorkPerCourse;

    const works = googleGet_(url).courseWork || [];

    summary.coursesScanned++;

    works.forEach(function(work) {
      summary.tasksScanned++;

      const dueDate = getAstraClassroomDueDate_(work);

      if (!dueDate) {
        summary.tasksWithoutDeadline++;
        return;
      }

      summary.tasksWithDeadline++;

      const result = calculateAstraDeadlinePriority_(
        dueDate,
        now
      );

      summary.priorities[result.priority]++;
      summary.deadlineStatus[result.status]++;
    });
  });

  Logger.log(JSON.stringify(summary));

  return summary;
};

/**
 * ASTRA — Classroom Submission Diagnostic v0.5
 *
 * Read-only analysis of coursework submission states.
 * No updates, notifications or Gemini calls.
 */

function testAstraClassroomSubmissionStates() {
  const courses = googleGet_(
    "https://classroom.googleapis.com/v1/courses" +
    "?courseStates=ACTIVE&pageSize=" + ASTRA.maxCourses
  ).courses || [];

  const summary = {
    event: "astra_classroom_submissions_test",
    coursesScanned: 0,
    deadlineTasks: 0,
    overdueTasks: 0,
    submitted: 0,
    returned: 0,
    pendingOverdue: 0,
    pendingUpcoming: 0,
    unknown: 0,
    states: {}
  };

  const now = new Date();

  courses.forEach(function(course) {
    if (!course.id) return;

    summary.coursesScanned++;

    const workResponse = googleGet_(
      "https://classroom.googleapis.com/v1/courses/" +
      encodeURIComponent(course.id) +
      "/courseWork?pageSize=" +
      ASTRA.maxCourseWorkPerCourse
    );

    (workResponse.courseWork || []).forEach(function(work) {
      if (!work.id || !work.dueDate) return;

      summary.deadlineTasks++;

      const deadline = getAstraClassroomDueDate_(work);

      if (!deadline) {
        summary.unknown++;
        return;
      }

      const overdue = new Date(deadline) <= now;

      if (overdue) summary.overdueTasks++;

      const url =
        "https://classroom.googleapis.com/v1/courses/" +
        encodeURIComponent(course.id) +
        "/courseWork/" +
        encodeURIComponent(work.id) +
        "/studentSubmissions?userId=me&pageSize=10";

      try {
        const response = googleGet_(url);
        const submissions = response.studentSubmissions || [];

        if (submissions.length !== 1 || response.nextPageToken) {
          summary.unknown++;
          return;
        }

        const state = submissions[0].state || "UNKNOWN";

        summary.states[state] =
          (summary.states[state] || 0) + 1;

        if (state === "TURNED_IN") {
          summary.submitted++;
        } else if (state === "RETURNED") {
          summary.returned++;
        } else if (
          state === "NEW" ||
          state === "CREATED" ||
          state === "RECLAIMED_BY_STUDENT"
        ) {
          if (overdue) {
            summary.pendingOverdue++;
          } else {
            summary.pendingUpcoming++;
          }
        } else {
          summary.unknown++;
        }

      } catch (error) {
        summary.unknown++;
        console.warn(
          "ASTRA submission lookup failed: " +
          String(error.message || error).slice(0, 150)
        );
      }
    });
  });

  Logger.log(JSON.stringify(summary));

  return summary;
};

/**
 * ASTRA — Classroom Action Engine v0.6
 * Conservative, deterministic action classification.
 */

function classifyAstraClassroomAction_(state, dueDate, now) {
  if (state === "TURNED_IN" || state === "RETURNED") {
    return {
      action: "none",
      priority: "low",
      reason: "Submission already turned in or returned."
    };
  }

  const pendingStates = [
    "NEW",
    "CREATED",
    "RECLAIMED_BY_STUDENT"
  ];

  if (pendingStates.indexOf(state) === -1) {
    return {
      action: "review",
      priority: "normal",
      reason: "Unknown submission state."
    };
  }

  if (!dueDate) {
    return {
      action: "review",
      priority: "normal",
      reason: "Pending work without a deadline."
    };
  }

  const deadline = calculateAstraDeadlinePriority_(dueDate, now);

  // Avoid automatically escalating old coursework.
  if (deadline.hoursRemaining < -720) {
    return {
      action: "review",
      priority: "low",
      reason: "Deadline expired over 30 days ago."
    };
  }

  if (deadline.status === "overdue") {
    return {
      action: "review",
      priority: "high",
      reason: "Pending work with an expired deadline."
    };
  }

  return {
    action: "review",
    priority: deadline.priority,
    reason: "Pending work with an upcoming deadline."
  };
}

function testAstraClassroomActionEngine() {
  const now = "2026-11-14T14:00:00Z";

  const cases = [
    {
      state: "TURNED_IN",
      due: "2026-11-10T14:00:00Z",
      expected: "none"
    },
    {
      state: "RETURNED",
      due: "2026-11-10T14:00:00Z",
      expected: "none"
    },
    {
      state: "CREATED",
      due: "2026-09-01T14:00:00Z",
      expected: "review"
    },
    {
      state: "RECLAIMED_BY_STUDENT",
      due: "2026-11-13T14:00:00Z",
      expected: "review"
    },
    {
      state: "CREATED",
      due: "2026-11-18T23:59:00Z",
      expected: "review"
    }
  ];

  const results = cases.map(function(item) {
    const result = classifyAstraClassroomAction_(
      item.state, item.due, now
    );

    return {
      state: item.state,
      expected: item.expected,
      actual: result.action,
      priority: result.priority,
      passed: result.action === item.expected
    };
  });

  const success = results.every(function(r) {
    return r.passed;
  });

  Logger.log(JSON.stringify({
    event: "astra_classroom_action_test",
    success: success,
    results: results
  }));

  if (!success) {
    throw new Error("Classroom action engine tests failed.");
  }

  return success;
};

/**
 * ASTRA — Classroom Real Action Diagnostic v0.7
 *
 * Integrates real Classroom submission states
 * with the deterministic action engine.
 *
 * READ ONLY:
 * - No spreadsheet modifications
 * - No notifications
 * - No Gemini calls
 */

function testAstraRealClassroomActions() {
  const coursesResponse = googleGet_(
    "https://classroom.googleapis.com/v1/courses" +
    "?courseStates=ACTIVE&pageSize=" + ASTRA.maxCourses
  );

  const courses = coursesResponse.courses || [];
  const now = new Date();

  const summary = {
    event: "astra_classroom_real_actions",
    status: "success",
    coursesScanned: 0,
    tasksScanned: 0,
    tasksWithDeadline: 0,
    tasksWithoutDeadline: 0,
    evaluated: 0,
    decisions: {
      none: 0,
      review: 0
    },
    priorities: {
      high: 0,
      normal: 0,
      low: 0
    },
    unknown: 0,
    errors: 0
  };

  courses.forEach(function(course) {
    if (!course.id) return;

    summary.coursesScanned++;

    try {
      const workResponse = googleGet_(
        "https://classroom.googleapis.com/v1/courses/" +
        encodeURIComponent(course.id) +
        "/courseWork?pageSize=" +
        ASTRA.maxCourseWorkPerCourse
      );

      const works = workResponse.courseWork || [];

      works.forEach(function(work) {
        if (!work.id) return;

        summary.tasksScanned++;

        if (!work.dueDate) {
          summary.tasksWithoutDeadline++;
          // No-deadline tasks are outside this test.
          return;
        }

        summary.tasksWithDeadline++;

        try {
          const dueDate =
            getAstraClassroomDueDate_(work);

          const url =
            "https://classroom.googleapis.com/v1/courses/" +
            encodeURIComponent(course.id) +
            "/courseWork/" +
            encodeURIComponent(work.id) +
            "/studentSubmissions?userId=me&pageSize=10";

          const response = googleGet_(url);
          const submissions =
            response.studentSubmissions || [];

          if (
            submissions.length !== 1 ||
            response.nextPageToken
          ) {
            summary.unknown++;
            return;
          }

          const state = submissions[0].state;

          const knownStates = [
            "NEW",
            "CREATED",
            "TURNED_IN",
            "RETURNED",
            "RECLAIMED_BY_STUDENT"
          ];

          if (knownStates.indexOf(state) === -1) {
            summary.unknown++;
            return;
          }

          const decision =
            classifyAstraClassroomAction_(
              state,
              dueDate,
              now
            );

          if (
            !Object.prototype.hasOwnProperty.call(
              summary.decisions,
              decision.action
            ) ||
            !Object.prototype.hasOwnProperty.call(
              summary.priorities,
              decision.priority
            )
          ) {
            summary.unknown++;
            return;
          }

          summary.decisions[decision.action]++;
          summary.priorities[decision.priority]++;
          summary.evaluated++;

        } catch (error) {
          summary.errors++;
          console.warn(
            "ASTRA coursework evaluation failed."
          );
        }
      });

    } catch (error) {
      summary.errors++;
      console.warn(
        "ASTRA course evaluation failed."
      );
    }
  });

  if (summary.errors > 0 || summary.unknown > 0) {
    summary.status = "partial";
  }

  Logger.log(JSON.stringify(summary));

  return summary;
}







