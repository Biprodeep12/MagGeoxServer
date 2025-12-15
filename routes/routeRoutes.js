const express = require("express");
const router = express.Router();
const RouteModel = require("../models/BusRouteInfo");
const { fetchORSRoute } = require("../services/orsService");

module.exports = (config) => {
  router.get("/:routeId/geojson", async (req, res) => {
    try {
      const routeDoc = await RouteModel.findOne({ Route: req.params.routeId }).lean();
      if (!routeDoc) {
        console.error(`[ERROR] Route not found: ${req.params.routeId}`);
        return res.status(404).json({ ok: false, error: "Route not found" });
      }
      const geometry = await fetchORSRoute(routeDoc.startPoint.coords, routeDoc.endPoint.coords, config.ORS_API_KEY);
      res.json({ ok: true, geometry });
    } catch (err) {
      console.error(`[ERROR] Failed to fetch geojson for route ${req.params.routeId}:`, err.message || err);
      console.error('[ERROR] Stack:', err.stack);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  return router;
};
