const express = require("express");
const router = express.Router();
const RouteModel = require("../models/BusRouteInfo");
const { fetchORSRoute } = require("../services/orsService");

module.exports = (config) => {
  router.get("/:routeId/geojson", async (req, res) => {
    try {
      const routeDoc = await RouteModel.findOne({ Route: req.params.routeId }).lean();
      if (!routeDoc) return res.status(404).json({ ok: false, error: "Route not found" });
      const geometry = await fetchORSRoute(routeDoc.startPoint.coords, routeDoc.endPoint.coords, config.ORS_API_KEY);
      res.json({ ok: true, geometry });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  return router;
};
