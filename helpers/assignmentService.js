const pointInPolygon = require("point-in-polygon");
const dbQuery = require("../helpers/query");
const constants = require("../vars/constants");

exports.getAutoAssignedBoy = async (lat, lng) => {

  try {

    console.log("🔍 ASSIGNMENT DEBUG - Checking zone for coordinates:", lat, lng);

    const zones = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `SELECT zone_id, zone_name, polygon FROM delivery_zones`
    );

    console.log("📍 ZONES FOUND:", zones?.length || 0);
    if (!zones || zones.length === 0) {
      console.log("❌ NO ZONES CONFIGURED - Add delivery zones from admin panel");
      return null;
    }

    let zoneId = null;
    let matchedZone = null;

    for (const zone of zones) {

      if (!zone.polygon) {
        console.log(`⚠️ Zone ${zone.zone_id} (${zone.zone_name}) has no polygon data`);
        continue;
      }

      // ⭐ SAFE PARSE
      let polygonData = null;
      try {
        polygonData =
          typeof zone.polygon === "string"
            ? JSON.parse(zone.polygon)
            : zone.polygon;
      } catch (parseErr) {
        console.log(`⚠️ Zone ${zone.zone_id} polygon JSON invalid:`, zone.polygon);
        continue;
      }

      const polygon = polygonData.map(p => [p.lat, p.lng]);
      const isInside = pointInPolygon([lat, lng], polygon);

      console.log(`   Zone ${zone.zone_id} (${zone.zone_name}): ${isInside ? '✅ MATCH' : '❌ no match'}`);

      if (isInside) {
        zoneId = zone.zone_id;
        matchedZone = zone.zone_name;
        break;
      }
    }

    if (!zoneId) {
      console.log(`❌ ADDRESS NOT IN ANY ZONE - Lat/Lng [${lat}, ${lng}] doesn't match any configured zone polygon`);
      return null;
    }

    console.log(`✅ FOUND ZONE: ${matchedZone} (ID: ${zoneId})`);

    const boys = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
      SELECT db.*, dz.zone_id
      FROM delivery_boys db
      JOIN delivery_boy_zones dz 
        ON db.delivery_boy_id = dz.delivery_boy_id
      WHERE dz.zone_id=${Number(zoneId)}
      AND db.is_active=1
      `
    );

    console.log(`👤 ACTIVE BOYS IN ZONE ${zoneId}:`, boys?.length || 0);

    if (!boys || boys.length === 0) {
      console.log(`❌ NO ACTIVE DELIVERY BOYS - Assign delivery boys to zone ${zoneId} from admin panel`);
      return null;
    }

    const selectedBoy = boys[Math.floor(Math.random() * boys.length)];
    console.log(`✅ AUTO-ASSIGNED: ${selectedBoy.name} (ID: ${selectedBoy.delivery_boy_id})`);

    return selectedBoy;

  } catch (err) {

    console.log("❌ ASSIGNMENT ERROR:", err.message);
    console.log(err.stack);
    return null;

  }
};
