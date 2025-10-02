const mongoose = require("mongoose");

const routeSchema = new mongoose.Schema({
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
});

module.exports = mongoose.model("BusRouteInfo", routeSchema);
