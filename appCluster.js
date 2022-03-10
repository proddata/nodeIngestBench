require("dotenv").config();
const cluster = require("cluster");

const totalCPUs = require("os").cpus().length;
const argv = require("minimist")(process.argv.slice(2));

const axios = require("axios");
const https = require("https");

const dataGenerator = require("./modules/dataGenerator");
const sqlGenerator = require("./modules/sqlGenerator");

let crateConfig, options, activeProcesses;
let stats_global = {
  records: 0,
  ts_start: Number.MAX_VALUE,
  ts_end: Number.MIN_VALUE,
};

// Master
if (cluster.isMaster) {
  console.log("CrateDB Ingest Bench Master started");

  crateConfig = {
    user: process.env.CRATE_USER || "crate",
    host: process.env.CRATE_HOST || "localhost",
    password: process.env.CRATE_PASSWORD || "",
    port: process.env.CRATE_PORT || 4200,
  };

  options = {
    dropTable: !(argv.drop_table === "false" && true),
    processes: Number(argv.processes) || totalCPUs,
    batchsize: Number(argv.batchsize) || 10000,
    max_rows: Number(argv.max_rows) || 1 * 1000 * 1000,
    table: argv.table || "georg.cpu2",
    shards: Number(argv.shards) || 12,
    concurrent_requests: Number(argv.concurrent_requests) || 20,
  };

  console.log("\n----------- Options -------------");
  console.log(options);
  console.log("---------------------------------");

  setupProcesses();

  cluster.on("exit", () => {
    activeProcesses -= 1;
    if (activeProcesses == 0) {
      outputGlobalStats(stats_global);
    }
  });
}

function setupProcesses() {
  activeProcesses = 0;
  for (let i = 0; i < options.processes; i += 1) {
    activeProcesses += 1;
    options.process_id = i;
    let env = { FORK_ENV: JSON.stringify({ crateConfig, options }) };
    cluster.fork(env);
  }

  for (const id in cluster.workers) {
    cluster.workers[id].on("message", messageHandler);
  }
}

function messageHandler(msg) {
  stats_global.records += msg.records;
  stats_global.ts_start = Math.min(stats_global.ts_start, msg.ts_start);
  stats_global.ts_end = Math.max(stats_global.ts_end, msg.ts_end);
}

function outputGlobalStats(stats_global) {
  stats_global.time = stats_global.ts_end - stats_global.ts_start;
  stats_global.speed = stats_global.records / stats_global.time;
  console.log("\n-------- Global Results ---------");
  console.log("Time\t", stats_global.time.toLocaleString(), "s");
  console.log("Rows\t", stats_global.records.toLocaleString(), "records");
  console.log("Speed\t", stats_global.speed.toLocaleString(), "rows per sec");
  console.log("---------------------------------\n");
}

/* XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
XXXXXXXXXXXXXXXXXXXXXXXXXX  WORKER XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
*/

// Worker
if (cluster.isWorker) {
  let env = JSON.parse(process.env["FORK_ENV"]);
  crateConfig = env.crateConfig;
  options = env.options;

  // Axios CrateDB HTTP setup
  const crate_api = `https://${crateConfig.host}:${crateConfig.port}/_sql`;
  const agent = new https.Agent({
    rejectUnauthorized: false,
  });
  const crate_api_config = {
    auth: {
      username: crateConfig.user,
      password: crateConfig.password,
    },
    httpsAgent: agent,
  };

  const STATEMENT = {
    dropTable: sqlGenerator.getDropTable(options.table),
    createTable: sqlGenerator.getCreateTable(options.table, options.shards),
    insert: sqlGenerator.getInsert(options.table),
    numDocs: sqlGenerator.getNumDocs(options.table),
    refresh: sqlGenerator.getRefreshTable(options.table),
  };

  let args_buffer = getNewBufferSync();

  let stats = {
    inserts: 0,
    inserts_done: 0,
    inserts_max: Math.ceil(options.max_rows / options.batchsize),
    ts_start: -1,
    ts_end: -1,
  };

  setup();

  async function request(body) {
    return axios.post(crate_api, body, crate_api_config);
  }

  async function setup() {
    await prepareTable();

    stats.ts_start = Date.now() / 1000;
    addInsert();
  }

  async function prepareTable() {
    try {
      if (options.dropTable) await request({ stmt: STATEMENT.dropTable });
      await request({ stmt: STATEMENT.createTable });
    } catch (err) {
      console.log(err.response.data);
    }
  }

  async function addInsert() {
    if (stats.inserts <= stats.inserts_max) {
      if (stats.inserts - stats.inserts_done < options.concurrent_requests) {
        stats.inserts += 1;
        insert();
        if (stats.inserts % options.concurrent_requests == 0) {
          getNewBufferSync();
        }
        addInsert();
      }
    }
  }

  async function insert() {
    let args_buffer_no = stats.inserts % options.concurrent_requests;
    let body = {
      stmt: STATEMENT.insert,
      bulk_args: args_buffer[args_buffer_no],
    };
    try {
      await request(body);
    } catch (err) {
      console.log(err.response.data);
    } finally {
      stats.inserts_done += 1;
      if (stats.inserts_done == stats.inserts_max) {
        finish();
      } else {
        addInsert();
      }
    }
  }

  async function finish() {
    stats.ts_end = Date.now() / 1000;
    await request({ stmt: STATEMENT.refresh });

    stats.time = stats.ts_end - stats.ts_start;
    stats.records = stats.inserts_done * options.batchsize;
    let speed = stats.records / stats.time;

    console.log("-------- Results ---------");
    console.log("Time\t", stats.time.toLocaleString(), "s");
    console.log("Rows\t", stats.records.toLocaleString(), "records");
    console.log("Speed\t", speed.toLocaleString(), "rows per sec");
    console.log("-------- Results ---------");

    process.send(stats);
    process.exit();
  }

  function getNewBufferSync() {
    return new Array(options.concurrent_requests).fill(
      dataGenerator.getCPUObjectBulkArray(options.batchsize),
    );
  }
}
