import { createApp } from "./app.js";
import { dependencies, allowedOrigins } from "./runtime.js";
const app = createApp(dependencies, allowedOrigins);
app.listen(Number(process.env.PORT || 3001), () => console.log("ClientDesk API listening"));

