
/**
 * ASTRA — Gemini Intelligence Core
 * Uses the official Gemini generateContent endpoint.
 */

const ASTRA_AI = {
  model: "gemini-3.5-flash-lite",
  endpoint: "https://generativelanguage.googleapis.com/v1beta/models/"
};

function testGeminiConnection() {
  const apiKey = PropertiesService
    .getScriptProperties()
    .getProperty("GEMINI_API_KEY");

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not found.");
  }

  const url = ASTRA_AI.endpoint +
    ASTRA_AI.model + ":generateContent";

  const payload = {
    contents: [{
      role: "user",
      parts: [{
        text: "Reply exactly: ASTRA ONLINE"
      }]
    }],
  generationConfig: {
    temperature: 0.2,
    maxOutputTokens: 64,
    thinkingConfig: {
      thinkingLevel: "LOW"
    }
} }
  const response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: {
      "x-goog-api-key": apiKey
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  const body = response.getContentText();

  if (status < 200 || status >= 300) {
    throw new Error(
      "Gemini API error (" + status + "): " +
      body.slice(0, 1000)
    );
  }

  const data = JSON.parse(body);

  const answer = (data.candidates || [])
    .flatMap(function(candidate) {
      return (candidate.content && candidate.content.parts) || [];
    })
    .filter(function(part) {
      return Boolean(part.text);
    })
    .map(function(part) {
      return part.text;
    })
    .join("\n");

  if (!answer) {
    throw new Error("Gemini returned no text.");
  }

  Logger.log("ASTRA GEMINI CONNECTION: SUCCESS");
  Logger.log("Model: " + ASTRA_AI.model);
  Logger.log("Response: " + answer);
};

function listGeminiModels() {
  const apiKey = PropertiesService
    .getScriptProperties()
    .getProperty("GEMINI_API_KEY");

  const url =
    "https://generativelanguage.googleapis.com/v1beta/models";

  const response = UrlFetchApp.fetch(url, {
    method: "get",
    headers: {
      "x-goog-api-key": apiKey
    },
    muteHttpExceptions: true
  });

  Logger.log("HTTP: " + response.getResponseCode());

  const data = JSON.parse(response.getContentText());

  if (data.models) {
    data.models.forEach(function(model) {
      if ((model.supportedGenerationMethods || [])
          .includes("generateContent")) {
        Logger.log(model.name);
      }
    });
  } else {
    Logger.log(JSON.stringify(data));
  }
}


/**
 * ASTRA — Gemini PDF Understanding Test
 * Tests actual semantic understanding of a Drive PDF.
 */

function testGeminiPdfUnderstanding() {
  const FILE_ID = "1ayx87ykb3tZ8bCUBdytGWGB0_UHTr7wz";

  const apiKey = PropertiesService
    .getScriptProperties()
    .getProperty("GEMINI_API_KEY");

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not found.");
  }

  // Step 1: Retrieve PDF through ASTRA Drive Reader.
  const pdf = getDriveContentForAI(FILE_ID);

  if (!pdf.success || pdf.kind !== "pdf" || !pdf.data) {
    throw new Error("ASTRA could not prepare the PDF.");
  }

  // Step 2: Prepare Gemini request.
  const url = ASTRA_AI.endpoint +
    ASTRA_AI.model + ":generateContent";

  const payload = {
    contents: [{
      role: "user",
      parts: [
        {
          text:
            "You are ASTRA, an intelligent document analysis system.\n\n" +
            "Analyze the attached PDF carefully.\n\n" +
            "1. Identify the document's subject.\n" +
            "2. Summarize its main content.\n" +
            "3. Identify three specific facts from the document.\n" +
            "4. If information is missing or unclear, say so.\n\n" +
            "Do not invent information. Answer in Portuguese.\n\n" +
            "Document: " + pdf.name
        },
        {
          inlineData: {
            mimeType: "application/pdf",
            data: pdf.data
          }
        }
      ]
    }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1024
    }
  };

  // Step 3: Send PDF to Gemini.
  const response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: {
      "x-goog-api-key": apiKey
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  const body = response.getContentText();

  if (status < 200 || status >= 300) {
    throw new Error(
      "Gemini PDF error (" + status + "): " +
      body.slice(0, 1500)
    );
  }

  const result = JSON.parse(body);

  const answer = (result.candidates || [])
    .flatMap(function(candidate) {
      return (candidate.content &&
        candidate.content.parts) || [];
    })
    .filter(function(part) {
      return Boolean(part.text);
    })
    .map(function(part) {
      return part.text;
    })
    .join("\n");

  if (!answer) {
    throw new Error(
      "Gemini received the request but returned no text. " +
      JSON.stringify(result.promptFeedback || {})
    );
  }

  // Step 4: Report diagnostic results.
  Logger.log("========== ASTRA PDF TEST ==========");
  Logger.log("Status: SUCCESS");
  Logger.log("Model: " + ASTRA_AI.model);
  Logger.log("Document: " + pdf.name);
  Logger.log("MIME Type: " + pdf.mimeType);
  Logger.log("PDF Size: " + pdf.size + " bytes");
  Logger.log("Gemini Interpretation:");
  Logger.log(answer);
  Logger.log("====================================");

  return {
    success: true,
    model: ASTRA_AI.model,
    document: pdf.name,
    interpretation: answer
  };
}
