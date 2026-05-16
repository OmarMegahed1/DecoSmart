import { env } from "./env";
import { createApp } from "./server";

const app = createApp();

app.listen(env.port, () => {
  console.log(`🚀 Decor AI backend running on http://localhost:${env.port}`);
  console.log(`   ENV: ${env.nodeEnv}`);
  console.log(`   CORS: ${env.corsOrigins.join(", ")}`);
});
