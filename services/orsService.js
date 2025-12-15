const axios = require("axios");

async function fetchORSRoute(start, end, ORS_API_KEY) {
  try {
    const url = "https://api.openrouteservice.org/v2/directions/driving-car/geojson";
    const body = { coordinates: [start, end] };
    const headers = {
      Authorization: ORS_API_KEY,
      "Content-Type": "application/json",
    };

    console.log(`[INFO] Fetching ORS route from ${start} to ${end}`);
    const res = await axios.post(url, body, { headers });
    const feature = res.data.features?.[0];
    if (!feature) {
      console.error(`[ERROR] ORS returned no route feature for ${start} to ${end}`);
      throw new Error("ORS returned no route feature");
    }
    console.log(`[INFO] Successfully fetched ORS route`);
    return feature.geometry;
  } catch (err) {
    console.error('[ERROR] ORS API Error:', err.message || err);
    console.error('[ERROR] Stack:', err.stack);
    if (err.response) {
      console.error('[ERROR] Response status:', err.response.status);
      console.error('[ERROR] Response data:', err.response.data);
    }
    throw err;
  }
}

module.exports = { fetchORSRoute };
