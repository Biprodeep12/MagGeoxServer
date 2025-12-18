const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const config = require("./utils/env");

const simulationRoutes = require("./routes/simulationRoutes");
const routeRoutes = require("./routes/routeRoutes");
const { setupSockets } = require("./services/socketService");

const app = express();
app.use(cors({
    origin: ["http://localhost:3000", "https://mapgoex.vercel.app"],
    methods: ["GET", "POST"],
  credentials: true
}));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "https://mapgoex.vercel.app"],
    methods: ["GET", "POST"]
  }
});

app.use("/api/simulate", simulationRoutes(io, config));
app.use("/api/route", routeRoutes(config));

setupSockets(io, config);

mongoose.connect(config.MONGODB_URI).then(() => {
  console.log("Connected to MongoDB");
  server.listen(config.PORT, () => console.log(`Server running on port ${config.PORT}`));
}).catch(err => {
  console.error("[ERROR] Failed to connect to MongoDB:", err.message || err);
  console.error("[ERROR] Stack:", err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[ERROR] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[ERROR] Uncaught Exception:', err.message || err);
  console.error('[ERROR] Stack:', err.stack);
  process.exit(1);
});
