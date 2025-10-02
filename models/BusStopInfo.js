const mongoose = require("mongoose");

const busStopInfoSchema = new mongoose.Schema(
  {
    routeId: { type: String, required: true, index: true },
    busId: { type: String, required: true },
    stops: [
      {
        stopId: { type: String, required: true },
        eta: { type: String, default: null },
        reached: { type: Boolean, default: false },
        reachedAt: { type: Date, default: null },
      },
    ],
    updatedAt: { type: Date, default: Date.now },
  },
  { minimize: false }
);

module.exports = mongoose.model("BusStopInfo", busStopInfoSchema);
