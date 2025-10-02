const axios = require("axios");

async function fetchORSRoute(start, end, ORS_API_KEY) {
  const url = "https://api.openrouteservice.org/v2/directions/driving-car/geojson";
  const body = { coordinates: [start, end] };
  const headers = {
    Authorization: ORS_API_KEY,
    "Content-Type": "application/json",
  };

  const res = await axios.post(url, body, { headers });
  const feature = res.data.features?.[0];
  if (!feature) throw new Error("ORS returned no route feature");
  return feature.geometry;
}

module.exports = { fetchORSRoute };
