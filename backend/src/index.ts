import "./db/config";
import { createApp } from "./server";
import { config } from "./db/config";

const app = createApp();

app.listen(config.port, () => {
  console.log(`🚀 Decor AI backend running on http://localhost:${config.port}`);
  console.log(`   ENV: ${config.nodeEnv}`);
  console.log(`   CORS: ${config.corsOrigins.join(", ")}`);
});
