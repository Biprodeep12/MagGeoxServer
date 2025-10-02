const express = require("express");
const router = express.Router();
const RouteModel = require("../models/BusRouteInfo");
const { startSimulation, updateBusLocationOnly } = require("../services/simulationService");

module.exports = (io, config) => {
  router.post("/:routeId/start", async (req, res) => {
    try {
      const routeDoc = await RouteModel.findOne({ Route: req.params.routeId }).lean();
      if (!routeDoc) return res.status(404).json({ ok: false, error: "Route not found" });
      const meta = await startSimulation(routeDoc, { ...config, io });
      res.json({ ok: true, meta });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.post("/:routeId/location", (req, res) => {
    const { coords, speedKmh } = req.body;
    if (!coords || coords.length !== 2) return res.status(400).json({ ok: false, error: "coords required" });
    const msg = updateBusLocationOnly(req.params.routeId, io, { coords, speedKmh }, config.BUS_SPEED_KMH);
    res.json({ ok: true, emitted: msg });
  });

  return router;
};
