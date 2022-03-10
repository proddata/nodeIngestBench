require("dotenv").config();
const cluster = require("cluster");

const totalCPUs = require("os").cpus().length;
const argv = require("minimist")(process.argv.slice(2));

const axios = require("axios");
const https = require("https");

const dataGenerator = require("./modules/dataGenerator");
const sqlGenerator = require("./modules/sqlGenerator");

let crateConfig, options, activeProcesses;
const statsGlobal = {
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
    ssl: process.env.SSL === "true" || false,
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
    if (activeProcesses === 0) {
      outputGlobalStats(statsGlobal);
    }
  });
}

function setupProcesses() {
  activeProcesses = 0;
  for (let i = 0; i < options.processes; i += 1) {
    activeProcesses += 1;
    options.process_id = i;
    const env = { FORK_ENV: JSON.stringify({ crateConfig, options }) };
    cluster.fork(env);
  }

  for (const id in cluster.workers) {
    cluster.workers[id].on("message", messageHandler);
  }
}

function messageHandler(msg) {
  statsGlobal.records += msg.records;
  statsGlobal.ts_start = Math.min(statsGlobal.ts_start, msg.ts_start);
  statsGlobal.ts_end = Math.max(statsGlobal.ts_end, msg.ts_end);
}

function outputGlobalStats() {
  statsGlobal.time = statsGlobal.ts_end - statsGlobal.ts_start;
  statsGlobal.speed = statsGlobal.records / statsGlobal.time;
  console.log("\n-------- Global Results ---------");
  console.log("Time\t", statsGlobal.time.toLocaleString(), "s");
  console.log("Rows\t", statsGlobal.records.toLocaleString(), "records");
  console.log("Speed\t", statsGlobal.speed.toLocaleString(), "rows per sec");
  console.log("---------------------------------\n");
}

/* XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
XXXXXXXXXXXXXXXXXXXXXXXXXX  WORKER XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
*/

// Worker
if (cluster.isWorker) {
  const env = JSON.parse(process.env.FORK_ENV);
  crateConfig = env.crateConfig;
  options = env.options;

  // Axios CrateDB HTTP setup
  const crateApi = `${crateConfig.ssl ? 'https' : 'http'}://${crateConfig.host}:${crateConfig.port}/_sql`;
  const agent = new https.Agent({
    rejectUnauthorized: false,
  });
  const crateApiConfig = {
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

  const argsBuffer = getNewBufferSync();

  const stats = {
    inserts: 0,
    inserts_done: 0,
    inserts_max: Math.ceil(options.max_rows / options.batchsize),
    ts_start: -1,
    ts_end: -1,
  };

  setup();

  async function request(body) {
    return axios.post(crateApi, body, crateApiConfig);
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
        if (stats.inserts % options.concurrent_requests === 0) {
          getNewBufferSync();
        }
        addInsert();
      }
    }
  }

  async function insert() {
    const argsBufferNo = stats.inserts % options.concurrent_requests;
    const body = {
      stmt: STATEMENT.insert,
      bulk_args: argsBuffer[argsBufferNo],
    };
    try {
      await request(body);
    } catch (err) {
      console.log(err.response.data);
    } finally {
      stats.inserts_done += 1;
      if (stats.inserts_done === stats.inserts_max) {
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
    const speed = stats.records / stats.time;

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
