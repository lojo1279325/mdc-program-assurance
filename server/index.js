import { createApp } from "./app.js";
import { createServer } from "node:http";

const app = createApp();
const port = Number(process.env.PORT || 5000);
createServer(app).listen(port, "0.0.0.0", () => {
  console.log(`MDC Program Assurance is serving on port ${port}`);
});
