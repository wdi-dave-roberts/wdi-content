import XLSX from "xlsx-js-style";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const googleDrivePath = path.join(process.env.HOME, "Google Drive/Shared drives/White Doe Inn/Operations/Building and Maintenance /Kitchen Remodel/Kitchen-Remodel-Tracker.xlsx");
const dataPath = path.join(__dirname, "..", "projects/kitchen-remodel/data.json");

// Read spreadsheet
const wb = XLSX.readFile(googleDrivePath);
// Support both "Open Questions" (current) and "Issues" (future) sheet names
const sheet = wb.Sheets["Open Questions"] || wb.Sheets["Issues"];
if (!sheet) {
  console.error("Error: Could not find 'Open Questions' or 'Issues' sheet in spreadsheet");
  process.exit(1);
}
const sheetData = XLSX.utils.sheet_to_json(sheet);

// Read data.json
const data = JSON.parse(fs.readFileSync(dataPath));

// Find responses and update questions
let updated = 0;
for (const row of sheetData) {
  const questionId = row["Question ID"];
  let response = row["Response"];
  if (response === undefined || response === null || response === "") continue;

  // Convert to string (in case Excel returns number/date)
  response = String(response).trim();
  if (!response) continue;

  const question = data.questions.find(q => q.id === questionId);
  if (question && question.status === "open") {
    question.response = { type: "free-text", value: response };
    question.status = "answered";
    question.respondedAt = new Date().toISOString().split("T")[0];
    updated++;
    console.log("Updated:", questionId);
    console.log("  Response:", response.substring(0, 60) + (response.length > 60 ? "..." : ""));
  }
}

if (updated > 0) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2) + "\n");
  console.log("\n✓ Imported", updated, "response(s) into data.json");
} else {
  console.log("No new responses to import");
}
