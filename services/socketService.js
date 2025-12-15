const { startSimulation, updateBusLocationOnly } = require("./simulationService");
const RouteModel = require("../models/BusRouteInfo");

function setupSockets(io, config) {
  io.on("connection", (socket) => {
    console.log("[INFO] Socket connected:", socket.id);

    socket.on("subscribe", (routeId) => {
      try {
        if (!routeId) {
          console.error(`[ERROR] Invalid routeId for subscribe`);
          return;
        }
        socket.join(routeId);
        console.log(`[INFO] Socket ${socket.id} subscribed to route: ${routeId}`);
      } catch (err) {
        console.error(`[ERROR] Subscribe error for socket ${socket.id}:`, err.message || err);
      }
    });
    
    socket.on("unsubscribe", (routeId) => {
      try {
        if (!routeId) {
          console.error(`[ERROR] Invalid routeId for unsubscribe`);
          return;
        }
        socket.leave(routeId);
        console.log(`[INFO] Socket ${socket.id} unsubscribed from route: ${routeId}`);
      } catch (err) {
        console.error(`[ERROR] Unsubscribe error for socket ${socket.id}:`, err.message || err);
      }
    });

    socket.on("startSimulation", async ({ routeId }) => {
      try {
        console.log(`[INFO] Start simulation request for route: ${routeId}`);
        const routeDoc = await RouteModel.findOne({ Route: routeId }).lean();
        if (!routeDoc) {
          console.error(`[ERROR] Route not found for simulation: ${routeId}`);
          throw new Error("Route not found");
        }
        await startSimulation(routeDoc, { ...config, io });
        console.log(`[INFO] Simulation started successfully for route: ${routeId}`);
        socket.emit("simulationStarted", { routeId, busId: routeId });
      } catch (err) {
        console.error(`[ERROR] Failed to start simulation for route ${routeId}:`, err.message || err);
        console.error('[ERROR] Stack:', err.stack);
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("updateBusLocation", ({ routeId, coords, speedKmh }) => {
      try {
        if (!routeId || !coords || coords.length !== 2) {
          console.error(`[ERROR] Invalid parameters for updateBusLocation - routeId: ${routeId}, coords: ${coords}`);
          socket.emit("error", { message: "Invalid parameters" });
          return;
        }
        console.log(`[INFO] Updating bus location for route: ${routeId}`);
        const msg = updateBusLocationOnly(routeId, io, { coords, speedKmh }, config.BUS_SPEED_KMH);
        socket.emit("ok", msg);
      } catch (err) {
        console.error(`[ERROR] Failed to update bus location for route ${routeId}:`, err.message || err);
        console.error('[ERROR] Stack:', err.stack);
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("disconnect", () => {
      console.log("[INFO] Socket disconnected:", socket.id);
    });
    
    socket.on("error", (err) => {
      console.error(`[ERROR] Socket error for ${socket.id}:`, err.message || err);
      console.error('[ERROR] Stack:', err.stack);
    });
  });
}

module.exports = { setupSockets };
