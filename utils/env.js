require("dotenv").config();

const config = {
  PORT: process.env.PORT || 8000,
  MONGODB_URI: process.env.MONGODB_URI,
  ORS_API_KEY: process.env.ORS_API_KEY,
  TICK_MS: parseInt(process.env.TICK_MS || "1000", 10),
  BUS_SPEED_KMH: parseFloat(process.env.BUS_SPEED_KMH || "40"),
  PROXIMITY_METERS: parseFloat(process.env.PROXIMITY_METERS || "100"),
};

if (!config.MONGODB_URI) {
  console.error("MONGODB_URI not set in env");
  process.exit(1);
}
if (!config.ORS_API_KEY) console.warn("Warning: ORS_API_KEY not set. ORS route fetch will fail.");

module.exports = config;
