import dotenv from "dotenv";
import minimist from "minimist";
dotenv.config();
const argv = minimist(process.argv.slice(2));

import dataGenerator  from "./modules/dataGeneratorPK.js";
import sqlGenerator from "./modules/sqlGeneratorPK.js";
import CrateDBClient from  "./modules/CrateDBClient.js";

const stats = {
  records: 0,
  inserts: 0,
  inserts_max : -1,
  clientsDone: 0,
  ts_start: Number.MAX_VALUE,
  ts_end: Number.MIN_VALUE,
};

const crateConfig = {
  user: process.env.CRATE_USER || "crate",
  host: process.env.CRATE_HOST || "localhost",
  password: process.env.CRATE_PASSWORD || "",
  port: process.env.CRATE_PORT || 4200,
  ssl: process.env.CRATE_SSL === "true" || false,
};

const options = {
  dropTable: !(argv.drop_table === "false" && true),
  batchSize: Number(argv.batch_size) || 5000,
  maxRows: Number(argv.max_rows) || 5_000_000,
  table: argv.table || "doc.cpu",
  shards: Number(argv.shards) || 12,
  concurrentRequests: Number(argv.concurrent_requests) || 4,
  extraTagsLength: Number(argv.extra_tags_length) || 0,
  replicas: Number(argv.replicas) || 0,
};

const STATEMENT = {
    dropTable: sqlGenerator.getDropTable(options.table),
    createTable: sqlGenerator.getCreateTable(options.table, options.shards, options.replicas),
    insert: sqlGenerator.getInsert(options.table),
    refresh: sqlGenerator.getRefreshTable(options.table),
};

const clients = [];
const payloadBuffer = [];
await setup();


async function setup() {
  let client = new CrateDBClient(crateConfig);
  console.log(`Setup started ...`);
  try {

    await client.executeStatement(STATEMENT.dropTable);
    await client.executeStatement(STATEMENT.createTable);

    stats.inserts_max = Math.ceil(options.maxRows / options.batchSize)

    for(let i = 0; i < options.concurrentRequests; i++){
      clients[i] = new CrateDBClient(crateConfig);
      payloadBuffer[i] = dataGenerator.getCPUObjectBulkArray(options.batchSize)
    }

  } catch (error) {
    console.error(`Error during setup:`, error);
    process.exit(1);
  } finally {
    console.log(`... Setup completed.`);
    stats.ts_start = Date.now() / 1000;
    clients.forEach((_,i) => addInsert(i))
  }
}

async function addInsert(i) {
  if (stats.inserts <= stats.inserts_max) {
    stats.inserts += 1;
    try {
      let res = clients[i].executeStatement(STATEMENT.insert, payloadBuffer[i]);
      payloadBuffer[i] = dataGenerator.getCPUObjectBulkArray(options.batchSize, stats.inserts-1)
      await res;
    } catch(error) {
      console.error(`Error during insert:`, error.data);
      process.exit(1);
    } finally {
      addInsert(i);
    }
  } else {
    stats.clientsDone += 1;
    if (stats.clientsDone == options.concurrentRequests) {
      finish();
    }
  }
}

function finish(){
  stats.ts_end = Date.now() / 1000;
  let records = stats.inserts * options.batchSize;
  let time = stats.ts_end - stats.ts_start;

  console.log("Records: ", records);
  console.log("Seconds: ", time);
  console.log("Records / second: ", records / time);
}