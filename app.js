require("dotenv").config();
const argv = require("minimist")(process.argv.slice(2));

const { Worker, workerData } = require("worker_threads");
const axios = require("axios");
const https = require("https");

const dataGenerator = require("./modules/dataGenerator");
const sqlGenerator = require("./modules/sqlGenerator");

const worker = new Worker("./app_worker.js");

const crateConfig = {
  user: process.env.CRATE_USER || "crate",
  host: process.env.CRATE_HOST || "localhost",
  password: process.env.CRATE_PASSWORD || "",
  port: process.env.CRATE_PORT || 4200,
};

const options = {
  dropTable: true,
  batchsize: Number(argv.batchsize) || 10000,
  max_rows: Number(argv.max_rows) || 1 * 1000 * 1000,
  table: argv.table || "georg.cpu2",
  shards: Number(argv.shards) || 12,
  concurrent_requests: Number(argv.concurrent_requests) || 20
};

console.log("-------- Options ---------");
console.log(options);
console.log("--------------------------");

// Axios CrateDB HTTP setup
const crate_api = `https://${crateConfig.host}:${crateConfig.port}/_sql`;
const agent = new https.Agent({
  rejectUnauthorized: false
});
const crate_api_config = {
  auth: {
    username: crateConfig.user,
    password: crateConfig.password
  },
  httpsAgent: agent
};

// SQL Statements
const STATEMENT = {
  dropTable: sqlGenerator.getDropTable(options.table),
  createTable: sqlGenerator.getCreateTable(options.table, options.shards),
  insert: sqlGenerator.getInsert(options.table),
  numDocs: sqlGenerator.getNumDocs(options.table),
  refresh: sqlGenerator.getRefreshTable(options.table)
};

let args_buffer = getNewBufferSync();

let stats = {
  inserts: 0,
  inserts_done: 0,
  inserts_max: Math.ceil(options.max_rows / options.batchsize),
  ts_start: -1,
  ts_end: -1
};

setup();

// Benchmark Logic

async function setup() {
  await prepareTable();

  stats.ts_start = Date.now() / 1000;
  addInsert();
}

async function prepareTable() {
  try {
    await axios.post(
      crate_api,
      { stmt: STATEMENT.dropTable },
      crate_api_config
    );
    await axios.post(
      crate_api,
      { stmt: STATEMENT.createTable },
      crate_api_config
    );
  } catch (err) {
    console.log(err);
  }
}

async function addInsert() {
  if (stats.inserts <= stats.inserts_max) {
    if (stats.inserts - stats.inserts_done < options.concurrent_requests) {
      stats.inserts++;
      insert();
      if (stats.inserts % options.concurrent_requests == 0) {
        getNewBuffer();
      }
      addInsert();
    } else {
      setTimeout(addInsert, 10);
    }
  }
}

async function insert() {
  let args_buffer_no = stats.inserts % options.concurrent_requests;
  let body = {
    stmt: STATEMENT.insert,
    bulk_args: args_buffer[args_buffer_no]
  };
  try {
    await axios.post(crate_api, body, crate_api_config);
  } catch (err) {
    console.log(err.response.data);
  } finally {
    stats.inserts_done++;
    if (stats.inserts_done == stats.inserts_max) {
      finish();
    }
  }
}

async function finish() {
  stats.ts_end = Date.now() / 1000;
  await axios.post(crate_api, { stmt: STATEMENT.refresh }, crate_api_config);

  let time = stats.ts_end - stats.ts_start;
  let records = stats.inserts_done * options.batchsize;
  let speed = records / time;

  console.log("-------- Results ---------");
  console.log("Time\t", time.toLocaleString(), "s");
  console.log("Rows\t", records.toLocaleString(), "records");
  console.log("Speed\t", speed.toLocaleString(), "rows per sec");
  console.log("-------- Results ---------");
}

// Worker handling
async function getNewBuffer() {
  worker.postMessage(options);
}

function getNewBufferSync() {
  return new Array(options.concurrent_requests).fill(
    dataGenerator.getCPUObjectBulkArray(options.batchsize)
  );
}

async function updateBuffer(message) {
  args_buffer = message.args_buffer;
  let progress = (stats.inserts_done * options.batchsize).toLocaleString();
  console.log("Buffer updated - sent: ", progress);
}

worker.on("message", updateBuffer);
worker.on("error", msg => console.log(msg));
worker.on("exit", code => {
  if (code !== 0)
    reject(new Error(`Stopped the Worker Thread with the exit code: ${code}`));
});

process.on("SIGTERM", function () {
  worker.postMessage({ exit: true });
  console.log("Finished all requests");
  process.exit();
});
