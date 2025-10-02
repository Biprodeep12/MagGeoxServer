const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const axios = require("axios");
const turf = require("@turf/turf");
const cors = require("cors");

require("dotenv").config();

const PORT = process.env.PORT || 8000;
const MONGODB_URI = process.env.MONGODB_URI;
const ORS_API_KEY = process.env.ORS_API_KEY;
const TICK_MS = parseInt(process.env.TICK_MS || "1000", 10);
const BUS_SPEED_KMH = parseFloat(process.env.BUS_SPEED_KMH || "40");
const PROXIMITY_METERS = parseFloat(process.env.PROXIMITY_METERS || "100");

if (!MONGODB_URI) {
  console.error("MONGODB_URI not set in env");
  process.exit(1);
}
if (!ORS_API_KEY) {
  console.warn("Warning: ORS_API_KEY not set in env. ORS route fetch will fail.");
}

const routeSchema = new mongoose.Schema(
  {
    Route: { type: String, required: true, index: true },
    startPoint: {
      name: String,
      coords: [Number],
    },
    endPoint: {
      name: String,
      coords: [Number],
    },
    busStops: [
      {
        stopId: String,
        name: String,
        coords: [Number],
      },
    ],
  },
);

const RouteModel = mongoose.model("BusRouteInfo", routeSchema);

const busStopInfoSchema = new mongoose.Schema(
  {
    routeId: { type: String, required: true, index: true },
    busId: { type: String, required: true },
    stops: [
      {
        stopId: { type: String, required: true },
        eta: { type: String, default: null },
        reached: { type: Boolean, default: false },
        reachedAt: { type: Date, default: null }
      },
    ],
    updatedAt: { type: Date, default: Date.now },
  },
  { minimize: false }
);

const BusStopInfoModel = mongoose.model("BusStopInfo", busStopInfoSchema);

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

const simulations = new Map();

async function fetchORSRoute(start, end) {
  const url = "https://api.openrouteservice.org/v2/directions/driving-car/geojson";
  const body = { coordinates: [start, end] };
  const headers = {
    Authorization: ORS_API_KEY,
    "Content-Type": "application/json",
  };

  const res = await axios.post(url, body, { headers });
  const feature = res.data.features && res.data.features[0];
  if (!feature) throw new Error("ORS returned no route feature");
  return feature.geometry;
}

async function startSimulation(routeId, options = {}) {
  if (simulations.has(routeId)) {
    console.log(`Simulation for ${routeId} already running`);
    return simulations.get(routeId).meta;
  }

  const routeDoc = await RouteModel.findOne({ Route: routeId }).lean();
  if (!routeDoc) throw new Error(`No route found with Route='${routeId}'`);

  const start = routeDoc.startPoint.coords;
  const end = routeDoc.endPoint.coords;

  const geometry = await fetchORSRoute(start, end);
  if (!geometry || geometry.type !== "LineString") {
    throw new Error("Unsupported geometry from ORS (expected LineString)");
  }
  const line = turf.lineString(geometry.coordinates);

  const totalLengthKm = turf.length(line, { units: "kilometers" });

  const stops = (routeDoc.busStops || []).map((s) => ({
    stopId: s.stopId,
    name: s.name,
    coords: s.coords,
    reached: false,
  }));

  const speedKmh = options.speedKmh || BUS_SPEED_KMH;
  const speedKmPerSec = speedKmh / 3600;
  const tickSeconds = TICK_MS / 1000;
  const stepKm = speedKmPerSec * tickSeconds;

  let distanceAlongKm = 0;
  const busId = routeId;

  const meta = {
    routeId,
    busId,
    speedKmh,
    totalLengthKm,
    startedAt: new Date(),
  };

  const intervalId = setInterval(async () => {
    distanceAlongKm += stepKm;
    if (distanceAlongKm > totalLengthKm) distanceAlongKm = totalLengthKm;

    const currentPoint = turf.along(line, distanceAlongKm, { units: "kilometers" });
    const coords = currentPoint.geometry.coordinates;

    let heading = null;
    const lookAheadKm = Math.min(0.01, totalLengthKm - distanceAlongKm);
    if (lookAheadKm > 0) {
      const aheadPoint = turf.along(line, distanceAlongKm + lookAheadKm, { units: "kilometers" });
      heading = turf.bearing(currentPoint, aheadPoint);
    }

    const stopETAs = stops.map((stop) => {
      if (stop.reached) {
        return {
          stopId: stop.stopId,
          eta: stop.reachedAt
            ? new Date(stop.reachedAt).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
              })
            : null, 
          etaSeconds: null,
          reached: true,
        };
      }

      const stopPoint = turf.point(stop.coords);
      const stopDistKm = turf.distance(currentPoint, stopPoint, { units: "kilometers" });
      const etaSeconds = Math.round((stopDistKm / speedKmh) * 3600);

      const etaDate = new Date(Date.now() + etaSeconds * 1000);
      const formattedETA = etaDate.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
      return {
        stopId: stop.stopId,
        eta: formattedETA,
        etaSeconds,
        reached: false,
      };
    }).filter(Boolean);

    await BusStopInfoModel.findOneAndUpdate(
      { routeId, busId },
      {
        routeId,
        busId,
        stops: stopETAs.map(({ stopId, eta, reached }) => ({
          stopId,
          eta,
          reached,
        })),
        updatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    io.to(routeId).emit("busStopInfo", {
      routeId,
      busId,
      stops: stopETAs.map(({ stopId, eta, etaSeconds, reached }) => ({
        stopId,
        eta,
        etaSeconds,
        reached,
      })),
      timestamp: Date.now(),
    });
    
    io.to(routeId).emit("locationUpdate", {
      busId,
      coords,
      heading,
      speedKmh,
      distanceAlongKm,
      finished: distanceAlongKm >= totalLengthKm,
      timestamp: Date.now(),
    });

    stops.forEach((stop) => {
      if (stop.reached) return;
      const stopPoint = turf.point(stop.coords);
      const dKm = turf.distance(currentPoint, stopPoint, { units: "kilometers" });
      if (dKm * 1000 <= PROXIMITY_METERS) {
        stop.reached = true;
        stop.reachedAt = Date.now();

        io.to(routeId).emit("stopReached", {
          busId,
          stopId: stop.stopId,
          stopName: stop.name,
          coords: stop.coords,
          distanceMeters: dKm * 1000,
          reachedAt: stop.reachedAt,
          timestamp: Date.now(),
        });
      }
    });

    if (distanceAlongKm >= totalLengthKm) {
      clearInterval(intervalId);
      simulations.delete(routeId);
      io.to(routeId).emit("simulationFinished", { busId, routeId, timestamp: Date.now() });
      console.log(`Simulation finished for ${routeId}`);
    }
  }, TICK_MS);

  simulations.set(routeId, {
    intervalId,
    meta,
    state: {
      distanceAlongKm,
      stops,
      line,
    },
  });

  return meta;
}

function updateBusLocationOnly(routeId, payload) {
  const busId = routeId;
  const msg = {
    busId,
    coords: payload.coords,
    speedKmh: payload.speedKmh || BUS_SPEED_KMH,
    manual: true,
    timestamp: Date.now(),
  };
  io.to(routeId).emit("locationUpdate", msg);
  return msg;
}

app.post("/api/simulate/:routeId/start", async (req, res) => {
  const routeId = req.params.routeId;
  try {
    const meta = await startSimulation(routeId);
    res.json({ ok: true, meta });
  } catch (err) {
    console.error("Failed to start simulation", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/simulate/:routeId/location", (req, res) => {
  const routeId = req.params.routeId;
  const { coords, speedKmh } = req.body;
  if (!coords || coords.length !== 2) {
    return res.status(400).json({ ok: false, error: "coords required as [lng, lat]" });
  }
  const msg = updateBusLocationOnly(routeId, { coords, speedKmh });
  res.json({ ok: true, emitted: msg });
});

app.get("/api/route/:routeId/geojson", async (req, res) => {
  try {
    const routeId = req.params.routeId;
    const routeDoc = await RouteModel.findOne({ Route: routeId }).lean();
    if (!routeDoc) return res.status(404).json({ ok: false, error: "Route not found" });
    const geometry = await fetchORSRoute(routeDoc.startPoint.coords, routeDoc.endPoint.coords);
    res.json({ ok: true, geometry });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

io.on("connection", (socket) => {
  console.log("socket connected:", socket.id);

  socket.on("subscribe", (routeId) => {
    if (!routeId) return;
    socket.join(routeId);
    console.log(`socket ${socket.id} subscribed to ${routeId}`);
  });

  socket.on("unsubscribe", (routeId) => {
    if (!routeId) return;
    socket.leave(routeId);
    console.log(`socket ${socket.id} unsubscribed from ${routeId}`);
  });

  socket.on("startSimulation", async ({ routeId }) => {
    try {
      await startSimulation(routeId);
      socket.emit("simulationStarted", { routeId, busId: routeId });
    } catch (err) {
      socket.emit("error", { message: err.message });
    }
  });

  socket.on("updateBusLocation", ({ routeId, coords, speedKmh }) => {
    try {
      const msg = updateBusLocationOnly(routeId, { coords, speedKmh });
      socket.emit("ok", msg);
    } catch (err) {
      socket.emit("error", { message: err.message });
    }
  });

  socket.on("disconnect", () => {
    console.log("socket disconnected:", socket.id);
  });
});

async function startServer() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB");
    server.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to connect to MongoDB:", err);
    process.exit(1);
  }
}

startServer();
