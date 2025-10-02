const turf = require("@turf/turf");
const BusStopInfoModel = require("../models/BusStopInfo");
const { fetchORSRoute } = require("./orsService");

const simulations = new Map();

async function startSimulation(routeDoc, { ORS_API_KEY, io, options = {}, TICK_MS, BUS_SPEED_KMH, PROXIMITY_METERS }) {
  const routeId = routeDoc.Route;
  if (simulations.has(routeId)) return simulations.get(routeId).meta;

  const geometry = await fetchORSRoute(routeDoc.startPoint.coords, routeDoc.endPoint.coords, ORS_API_KEY);
  if (!geometry || geometry.type !== "LineString") throw new Error("Unsupported geometry from ORS");

  const line = turf.lineString(geometry.coordinates);
  const totalLengthKm = turf.length(line, { units: "kilometers" });

  const stops = (routeDoc.busStops || []).map((s) => ({
    stopId: s.stopId,
    name: s.name,
    coords: s.coords,
    reached: false,
  }));

  const speedKmh = options.speedKmh || BUS_SPEED_KMH;
  const stepKm = (speedKmh / 3600) * (TICK_MS / 1000);

  let distanceAlongKm = 0;
  const busId = routeId;

  const meta = { routeId, busId, speedKmh, totalLengthKm, startedAt: new Date() };

  const intervalId = setInterval(async () => {
    distanceAlongKm += stepKm;
    if (distanceAlongKm > totalLengthKm) distanceAlongKm = totalLengthKm;

    const currentPoint = turf.along(line, distanceAlongKm, { units: "kilometers" });
    const coords = currentPoint.geometry.coordinates;

    let heading = null;
    if (distanceAlongKm < totalLengthKm) {
      const aheadPoint = turf.along(line, distanceAlongKm + 0.01, { units: "kilometers" });
      heading = turf.bearing(currentPoint, aheadPoint);
    }

    // const stopETAs = stops.map((stop) => {
    //   if (stop.reached) {
    //     return { stopId: stop.stopId, eta: new Date(stop.reachedAt).toLocaleTimeString(), etaSeconds: null, reached: true };
    //   }
    //   const stopDistKm = turf.distance(currentPoint, turf.point(stop.coords), { units: "kilometers" });
    //   const etaSeconds = Math.round((stopDistKm / speedKmh) * 3600);
    //   const formattedETA = new Date(Date.now() + etaSeconds * 1000).toLocaleTimeString();
    //   return { stopId: stop.stopId, eta: formattedETA, etaSeconds, reached: false };
    // });

    const stopETAs = stops.map((stop) => {
      if (stop.reached) {
        return {
          stopId: stop.stopId,
          eta: stop.reachedAt
            ? new Date(stop.reachedAt).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
              })
            : null, 
          etaSeconds: null,
          reached: true,
        };
      }

      const stopPoint = turf.point(stop.coords);
      const stopDistKm = turf.distance(currentPoint, stopPoint, { units: "kilometers" });
      const etaSeconds = Math.round((stopDistKm / speedKmh) * 3600);

      const etaDate = new Date(Date.now() + etaSeconds * 1000);
      const formattedETA = etaDate.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
      return {
        stopId: stop.stopId,
        eta: formattedETA,
        etaSeconds,
        reached: false,
      };
    }).filter(Boolean);

    await BusStopInfoModel.findOneAndUpdate(
      { routeId, busId },
      { routeId, busId, stops: stopETAs, updatedAt: new Date() },
      { upsert: true }
    );

    io.to(routeId).emit("busStopInfo", { routeId, busId, stops: stopETAs, timestamp: Date.now() });
    io.to(routeId).emit("locationUpdate", { busId, coords, heading, speedKmh, distanceAlongKm, finished: distanceAlongKm >= totalLengthKm, timestamp: Date.now() });

    stops.forEach((stop) => {
      if (!stop.reached) {
        const dKm = turf.distance(currentPoint, turf.point(stop.coords), { units: "kilometers" });
        if (dKm * 1000 <= PROXIMITY_METERS) {
          stop.reached = true;
          stop.reachedAt = Date.now();
          io.to(routeId).emit("stopReached", { busId, stopId: stop.stopId, stopName: stop.name, coords: stop.coords });
        }
      }
    });

    if (distanceAlongKm >= totalLengthKm) {
      clearInterval(intervalId);
      simulations.delete(routeId);
      io.to(routeId).emit("simulationFinished", { busId, routeId, timestamp: Date.now() });
    }
  }, TICK_MS);

  simulations.set(routeId, { intervalId, meta, state: { distanceAlongKm, stops, line } });
  return meta;
}

function updateBusLocationOnly(routeId, io, payload, BUS_SPEED_KMH) {
  const msg = {
    busId: routeId,
    coords: payload.coords,
    speedKmh: payload.speedKmh || BUS_SPEED_KMH,
    manual: true,
    timestamp: Date.now(),
  };
  io.to(routeId).emit("locationUpdate", msg);
  return msg;
}

module.exports = { startSimulation, updateBusLocationOnly };
