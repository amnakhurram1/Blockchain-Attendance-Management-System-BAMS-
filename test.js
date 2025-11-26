// test.js
const BAMS = require("./manager");
const fs = require("fs");
const path = require("path");

const system = new BAMS();

// Mark some attendance
system.markAttendance("22f-3633", "Present");
system.markAttendance("22f-3633", "Absent");
system.markAttendance("22f-3715", "Leave");

// Validate
console.log("\n=== FULL SYSTEM VALIDATION ===");
console.log("All chains valid?", system.validateAll() ? "YES" : "NO");

// Show one student ledger
const chainFile = path.join(__dirname, "data", "Student_22f-3633.json");
if (fs.existsSync(chainFile)) {
  console.log("\nAmna Khurram's Blockchain Ledger:");
  console.log(
    JSON.stringify(JSON.parse(fs.readFileSync(chainFile, "utf8")), null, 2)
  );
}
