import { createApp } from "./app.js";
import { createServer } from "node:http";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = createApp();
app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), "../public")));
const port = Number(process.env.PORT || 5000);
createServer(app).listen(port, "0.0.0.0", () => {
  console.log(`MDC Program Assurance is serving on port ${port}`);
});
