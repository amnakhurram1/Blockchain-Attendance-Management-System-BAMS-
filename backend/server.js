// backend/server.js
const express = require("express");
const cors = require("cors");
const BAMS = require("../manager");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const system = new BAMS();

const getToday = () => new Date().toISOString().split("T")[0];

// === DEPARTMENTS ===
app.get("/api/departments", (req, res) => {
  const depts = Array.from(system.departments.keys()).filter((name) => {
    const chain = system.departments.get(name);
    const latest = chain.getLatestData();
    return latest && latest.status !== "deleted";
  });
  res.json(depts);
});

app.post("/api/departments", (req, res) => {
  const { name } = req.body;
  system.createDepartment(name);
  res.json({ success: true, message: `Department ${name} created` });
});

app.put("/api/departments/:oldName", (req, res) => {
  const { oldName } = req.params;
  const { newName } = req.body;
  const success = system.updateDepartment(oldName, newName);
  res.json({ success, message: success ? "Updated" : "Not found" });
});

app.delete("/api/departments/:name", (req, res) => {
  const { name } = req.params;
  const success = system.deleteDepartment(name);
  res.json({ success, message: success ? "Marked as deleted" : "Not found" });
});

// === CLASSES ===
app.get("/api/classes/:deptName", (req, res) => {
  const { deptName } = req.params;
  const classes = Array.from(system.classes.keys())
    .filter((key) => key.startsWith(deptName + "__"))
    .map((key) => key.split("__")[1])
    .filter((className) => {
      const chain = system.classes.get(`${deptName}__${className}`);
      const latest = chain.getLatestData();
      return latest && latest.status !== "deleted";
    });
  res.json(classes);
});

app.post("/api/classes", (req, res) => {
  const { deptName, className } = req.body;
  const success = system.createClass(deptName, className);
  res.json({ success, message: success ? "Class created" : "Dept not found" });
});
// === UPDATE CLASS ===
app.put("/api/classes/:deptName/:className", (req, res) => {
  const { deptName, className } = req.params;
  const { newName } = req.body;

  if (!newName) {
    return res.status(400).json({ error: "newName is required" });
  }

  const success = system.updateClass(deptName, className, newName);
  res.json({
    success,
    message: success ? "Class updated (new block appended)" : "Class not found",
  });
});

// === DELETE CLASS ===
app.delete("/api/classes/:deptName/:className", (req, res) => {
  const { deptName, className } = req.params;

  const success = system.deleteClass(deptName, className);
  res.json({
    success,
    message: success ? "Class marked as deleted" : "Class not found",
  });
});
// === STUDENTS ===
app.get("/api/students/:deptName/:className", (req, res) => {
  const { deptName, className } = req.params;
  const key = `${deptName}__${className}`;
  const classChain = system.classes.get(key);
  if (!classChain) return res.json([]);

  const students = Array.from(system.students.entries())
    .filter(([rollNo, chain]) => {
      const latest = chain.getLatestData();
      return (
        latest &&
        latest.deptName === deptName &&
        latest.className === className &&
        latest.status !== "deleted"
      );
    })
    .map(([rollNo, chain]) => chain.getLatestData());
  res.json(students);
});

app.post("/api/students", (req, res) => {
  const { deptName, className, rollNo, name } = req.body;
  const success = system.createStudent(deptName, className, rollNo, name);
  res.json({ success, message: success ? "Student added" : "Error" });
});

// === UPDATE STUDENT ===
app.put("/api/students/:rollNo", (req, res) => {
  const { rollNo } = req.params;
  const updates = req.body; // { name?, rollNo?, deptName?, className? }

  if (!updates || Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No updates provided" });
  }

  const success = system.updateStudent(rollNo, updates);
  res.json({
    success,
    message: success
      ? "Student updated (new block)"
      : "Student not found or deleted",
  });
});

// === DELETE STUDENT ===
app.delete("/api/students/:rollNo", (req, res) => {
  const { rollNo } = req.params;
  const success = system.deleteStudent(rollNo);
  res.json({
    success,
    message: success ? "Student marked as deleted" : "Student not found",
  });
});

// === ATTENDANCE ===
app.post("/api/attendance", (req, res) => {
  const { rollNo, status } = req.body;
  const success = system.markAttendance(rollNo, status);
  res.json({ success, message: success ? "Marked" : "Student not found" });
});

// === NEW: TODAY'S ATTENDANCE ===
app.get("/api/attendance/today", (req, res) => {
  const today = getToday();
  const records = [];

  for (const [rollNo, chain] of system.students) {
    const latest = chain.getLatestData();
    if (!latest || latest.status === "deleted") continue;

    for (const block of chain.chain) {
      if (block.transactions.action === "attendance") {
        const date = new Date(block.timestamp).toISOString().split("T")[0];
        if (date === today) {
          const tx = block.transactions;
          const attendanceStatus = tx.attendanceStatus || tx.status || ""; // backward compat

          records.push({
            rollNo: tx.rollNo,
            name: tx.name,
            deptName: tx.deptName,
            className: tx.className,
            status: attendanceStatus,
            time: new Date(block.timestamp).toLocaleTimeString(),
            date: date,
          });
        }
      }
    }
  }

  res.json({
    date: today,
    total: records.length,
    records: records.sort((a, b) => a.rollNo.localeCompare(b.rollNo)),
  });
});

// === NEW: CLASS ATTENDANCE REPORT ===
app.get("/api/attendance/class/:deptName/:className", (req, res) => {
  const { deptName, className } = req.params;
  const classKey = `${deptName}__${className}`;
  const dateMap = new Map(); // date → { present, absent, leave, total }

  for (const [rollNo, chain] of system.students) {
    const latest = chain.getLatestData();
    if (
      !latest ||
      latest.deptName !== deptName ||
      latest.className !== className ||
      latest.status === "deleted"
    )
      continue;

    const attendanceByDate = new Map();

    for (const block of chain.chain) {
      if (block.transactions.action === "attendance") {
        const date = new Date(block.timestamp).toISOString().split("T")[0];
        const tx = block.transactions;
        const statusRaw = tx.attendanceStatus || tx.status || "";
        const status = statusRaw.toLowerCase();

        if (!status) continue;
        attendanceByDate.set(date, status);
      }
    }

    for (const [date, status] of attendanceByDate) {
      if (!dateMap.has(date)) {
        dateMap.set(date, { present: 0, absent: 0, leave: 0, total: 0 });
      }
      const day = dateMap.get(date);

      if (day[status] !== undefined) {
        day[status] = (day[status] || 0) + 1;
      }
      day.total++;
    }
  }

  const summary = Array.from(dateMap.entries())
    .map(([date, stats]) => ({ date, ...stats }))
    .sort((a, b) => b.date.localeCompare(a.date));

  res.json({
    class: classKey,
    summary,
    totalStudentsCount: system.students.size,
  });
});

// === NEW: DEPARTMENT ATTENDANCE REPORT ===
app.get("/api/attendance/department/:deptName", (req, res) => {
  const { deptName } = req.params;
  const dateMap = new Map();

  for (const [rollNo, chain] of system.students) {
    const latest = chain.getLatestData();
    if (!latest || latest.deptName !== deptName || latest.status === "deleted")
      continue;

    for (const block of chain.chain) {
      if (block.transactions.action === "attendance") {
        const date = new Date(block.timestamp).toISOString().split("T")[0];
        const tx = block.transactions;
        const statusRaw = tx.attendanceStatus || tx.status || "";
        const status = statusRaw.toLowerCase();
        if (!status) continue;

        if (!dateMap.has(date))
          dateMap.set(date, { present: 0, absent: 0, leave: 0, total: 0 });

        const day = dateMap.get(date);
        if (day[status] !== undefined) {
          day[status]++;
        }
        day.total++;
      }
    }
  }

  const summary = Array.from(dateMap.entries())
    .map(([date, stats]) => ({ date, ...stats }))
    .sort((a, b) => b.date.localeCompare(a.date));

  res.json({
    department: deptName,
    summary,
    totalStudents: Array.from(system.students.values()).filter((s) => {
      const d = s.getLatestData();
      return d && d.deptName === deptName && d.status !== "deleted";
    }).length,
  });
});

// === LEDGER ===
app.get("/api/ledger/:rollNo", (req, res) => {
  const { rollNo } = req.params;
  const chain = system.getStudentChain(rollNo);
  if (!chain) return res.status(404).json({ error: "Not found" });

  res.json({ chain: chain.chain });
});

// === SEARCH ===
app.get("/api/search", (req, res) => {
  const { q } = req.query;
  const results = system
    .getAllStudents()
    .filter(
      (s) =>
        s.name.toLowerCase().includes(q.toLowerCase()) || s.rollNo.includes(q)
    );
  res.json(results);
});

// === VALIDATE ALL ===
// BETTER VALIDATION ENDPOINT
app.get("/api/validate", (req, res) => {
  console.log("\nValidation requested via API...");
  const valid = system.validateAll();
  res.json({
    valid,
    message: valid
      ? "FULL HIERARCHY VALIDATED — Dept → Class → Student links are correct!"
      : "Validation failed — check server console",
    timestamp: new Date().toISOString(),
  });
});

// === EXPLORER (All Chains) ===
app.get("/api/explorer", (req, res) => {
  const explorer = {
    departments: Object.fromEntries(
      Array.from(system.departments.entries()).map(([name, chain]) => [
        name,
        chain.chain,
      ])
    ),
    classes: Object.fromEntries(
      Array.from(system.classes.entries()).map(([key, chain]) => [
        key,
        chain.chain,
      ])
    ),
    students: Object.fromEntries(
      Array.from(system.students.entries()).map(([rollNo, chain]) => [
        rollNo,
        chain.chain,
      ])
    ),
  };
  res.json(explorer);
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
