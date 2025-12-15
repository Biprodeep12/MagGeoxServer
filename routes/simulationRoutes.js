const express = require("express");
const router = express.Router();
const RouteModel = require("../models/BusRouteInfo");
const { startSimulation, updateBusLocationOnly } = require("../services/simulationService");

module.exports = (io, config) => {
  router.post("/:routeId/start", async (req, res) => {
    try {
      const routeDoc = await RouteModel.findOne({ Route: req.params.routeId }).lean();
      if (!routeDoc) {
        console.error(`[ERROR] Route not found for simulation start: ${req.params.routeId}`);
        return res.status(404).json({ ok: false, error: "Route not found" });
      }
      const meta = await startSimulation(routeDoc, { ...config, io });
      console.log(`[INFO] Simulation started for route: ${req.params.routeId}`);
      res.json({ ok: true, meta });
    } catch (err) {
      console.error(`[ERROR] Failed to start simulation for route ${req.params.routeId}:`, err.message || err);
      console.error('[ERROR] Stack:', err.stack);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.post("/:routeId/location", (req, res) => {
    try {
      const { coords, speedKmh } = req.body;
      if (!coords || coords.length !== 2) {
        console.error(`[ERROR] Invalid coords for route ${req.params.routeId}:`, coords);
        return res.status(400).json({ ok: false, error: "coords required" });
      }
      const msg = updateBusLocationOnly(req.params.routeId, io, { coords, speedKmh }, config.BUS_SPEED_KMH);
      res.json({ ok: true, emitted: msg });
    } catch (err) {
      console.error(`[ERROR] Failed to update bus location for route ${req.params.routeId}:`, err.message || err);
      console.error('[ERROR] Stack:', err.stack);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  return router;
};
