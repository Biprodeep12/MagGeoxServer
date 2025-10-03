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
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use("/api/simulate", simulationRoutes(io, config));
app.use("/api/route", routeRoutes(config));

setupSockets(io, config);

mongoose.connect(config.MONGODB_URI).then(() => {
  console.log("Connected to MongoDB");
  server.listen(config.PORT, () => console.log(`Server running on port ${config.PORT}`));
}).catch(err => {
  console.error("Failed to connect to MongoDB:", err);
  process.exit(1);
});
