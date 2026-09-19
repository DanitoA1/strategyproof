import { Daytona } from "@daytona/sdk";

const d = new Daytona({
  apiKey: process.env.DAYTONA_API_KEY,
  apiUrl: process.env.DAYTONA_API_URL || undefined,
  target: process.env.DAYTONA_TARGET || undefined,
});
const items = [];
for await (const s of d.list()) items.push({ id: s.id, state: s.state, labels: s.labels });
console.log(`${items.length} sandbox(es) remaining`, items);
