const _ = require("lodash");
const pEachSeries = require("p-each-series");
const fnArgs = require("fn-args");
const { promisify } = require("util");
const status = require("./status");

const configFile = require("../env/configFile");
const migrationsDir = require("../env/migrationsDir");

module.exports = async (db, verbose) => {
  const statusItems = await status(db);
    const pendingItems = _.filter(statusItems, function(m) {
	    return m.appliedAt === "PENDING" || m.isSeed;
    });
  const migrated = [];

  const migrateItem = async item => {
    try {
      const migration = await migrationsDir.loadMigration(item.fileName);
      
      if (verbose) {
        console.log("MIGRATING: " + item.fileName);
      }
	    
      if (item.isSeed) {
        try {
          const downArgs = fnArgs(migration.down);
          const down = downArgs.length > 1 ? promisify(migration.down) : migration.down;
          await down(db, verbose);
        } catch (err) {
          throw new Error(
            `Could not migrate seed down ${item.fileName}: ${err.message}`
          );
        }
        
        try {
          await collection.deleteOne({ fileName: fileName });         
        } catch (err) {
          throw new Error(`Could not update changelog: ${err.message}`);
        }

      }
      const args = fnArgs(migration.up);
      const up = args.length > 1 ? promisify(migration.up) : migration.up;
      await up(db);
    } catch (err) {
      const error = new Error(
        `Could not migrate up ${item.fileName}: ${err.message}`
      );
      error.migrated = migrated;
      throw error;
    }

    const config = await configFile.read();
    const collectionName = config.changelogCollectionName;
    const collection = db.collection(collectionName);

    const { fileName } = item;
    const appliedAt = new Date();

    try {
      if (item.isSeed) {
        await collection.deleteOne({ fileName: fileName });
      }
      await collection.insertOne({ fileName, appliedAt });
    } catch (err) {
      throw new Error(`Could not update changelog: ${err.message}`);
    }
    migrated.push(item.fileName);
  };

  await pEachSeries(pendingItems, migrateItem);
  return migrated;
};
