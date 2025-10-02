const { startSimulation, updateBusLocationOnly } = require("./simulationService");
const RouteModel = require("../models/BusRouteInfo");

function setupSockets(io, config) {
  io.on("connection", (socket) => {
    console.log("socket connected:", socket.id);

    socket.on("subscribe", (routeId) => routeId && socket.join(routeId));
    socket.on("unsubscribe", (routeId) => routeId && socket.leave(routeId));

    socket.on("startSimulation", async ({ routeId }) => {
      try {
        const routeDoc = await RouteModel.findOne({ Route: routeId }).lean();
        if (!routeDoc) throw new Error("Route not found");
        await startSimulation(routeDoc, { ...config, io });
        socket.emit("simulationStarted", { routeId, busId: routeId });
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("updateBusLocation", ({ routeId, coords, speedKmh }) => {
      try {
        const msg = updateBusLocationOnly(routeId, io, { coords, speedKmh }, config.BUS_SPEED_KMH);
        socket.emit("ok", msg);
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("disconnect", () => console.log("socket disconnected:", socket.id));
  });
}

module.exports = { setupSockets };
