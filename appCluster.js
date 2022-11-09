require("dotenv").config();
const cluster = require("cluster");

const totalCPUs = require("os").cpus().length;
const argv = require("minimist")(process.argv.slice(2));

const axios = require("axios");
const https = require("https");

const dataGenerator = require("./modules/dataGenerator");
const sqlGenerator = require("./modules/sqlGenerator");

let crateConfig; let options; let activeProcesses;
const statsGlobal = {
  records: 0,
  ts_start: Number.MAX_VALUE,
  ts_end: Number.MIN_VALUE,
};

function messageHandler(msg) {
  statsGlobal.records += msg.records;
  statsGlobal.ts_start = Math.min(statsGlobal.ts_start, msg.ts_start);
  statsGlobal.ts_end = Math.max(statsGlobal.ts_end, msg.ts_end);
}

function setupProcesses() {
  activeProcesses = 0;
  let worker;

  for (let i = 0; i < options.processes; i += 1) {
    activeProcesses += 1;
    options.process_id = i;
    const env = { FORK_ENV: JSON.stringify({ crateConfig, options }) };
    worker = cluster.fork(env);
    worker.on("message", messageHandler);
  }
}

function outputGlobalStats() {
  console.log("\n-------- Global Results ---------");
  if (statsGlobal.records > 0) {
    statsGlobal.time = statsGlobal.ts_end - statsGlobal.ts_start;
    statsGlobal.speed = statsGlobal.records / statsGlobal.time;

    console.log("Time\t", statsGlobal.time.toLocaleString(), "s");
    console.log("Rows\t", statsGlobal.records.toLocaleString(), "records");
    console.log("Speed\t", statsGlobal.speed.toLocaleString(), "rows per sec");
  } else {
    console.log("No rows inserted");
  }
  console.log("---------------------------------\n");
}

function logError(error) {
  if (error.response) {
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx
    console.log(error.response.data);
    console.log(error.response.status);
    console.log(error.response.headers);
  } else if (error.request) {
    // The request was made but no response was received
    // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
    // http.ClientRequest in node.js
    console.log(error.request);
  } else {
    // Something happened in setting up the request that triggered an Error
    console.log('Error', error.message);
  }
}

// Master
if (cluster.isMaster) {
  console.log("CrateDB Ingest Bench Master started");

  crateConfig = {
    user: process.env.CRATE_USER || "crate",
    host: process.env.CRATE_HOST || "localhost",
    password: process.env.CRATE_PASSWORD || "",
    port: process.env.CRATE_PORT || 4200,
    ssl: process.env.CRATE_SSL === "true" || false,
  };

  options = {
    dropTable: !(argv.drop_table === "false" && true),
    processes: Number(argv.processes) || totalCPUs,
    batchSize: Number(argv.batch_size) || 10000,
    maxRows: Number(argv.max_rows) || 1 * 1000 * 1000,
    table: argv.table || "doc.cpu",
    shards: Number(argv.shards) || 12,
    concurrentRequests: Number(argv.concurrent_requests) || 20,
    extraTagsLength: Number(argv.extra_tags_length) || 0,
    replicas: Number(argv.replicas) || 0,
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

  // https://www.npmjs.com/package/axios#creating-an-instance
  const httpclient = axios.create(crateApiConfig);

  const STATEMENT = {
    dropTable: sqlGenerator.getDropTable(options.table),
    createTable: sqlGenerator.getCreateTable(options.table, options.shards, options.replicas),
    insert: sqlGenerator.getInsert(options.table),
    refresh: sqlGenerator.getRefreshTable(options.table),
  };

  function getNewBufferSync() {
    return new Array(options.concurrentRequests).fill(
      dataGenerator.getCPUObjectBulkArray(options.batchsize, options.extraTagsLength),
    );
  }

  const argsBuffer = getNewBufferSync();

  const stats = {
    inserts: 0,
    inserts_done: 0,
    inserts_max: Math.ceil(options.maxRows / options.batchSize),
    ts_start: -1,
    ts_end: -1,
  };

  async function request(body) {
    return httpclient.post(crateApi, body);
  }

  async function prepareTable() {
    try {
      if (options.dropTable) await request({ stmt: STATEMENT.dropTable });
      await request({ stmt: STATEMENT.createTable });
    } catch (err) {
      logError(err);
    }
  }

  async function addInsert() {
    if (stats.inserts <= stats.inserts_max) {
      if (stats.inserts - stats.inserts_done < options.concurrentRequests) {
        stats.inserts += 1;
        insert();
        if (stats.inserts % options.concurrentRequests === 0) {
          getNewBufferSync();
        }
        addInsert();
      }
    }
  }

  async function setup() {
    await prepareTable();

    stats.ts_start = Date.now() / 1000;
    addInsert();
  }

  async function finish() {
    stats.ts_end = Date.now() / 1000;
    await request({ stmt: STATEMENT.refresh });

    stats.records = stats.inserts_done * options.batchSize;

    console.log("-------- Results ---------");
    if (stats.records > 0) {
      stats.time = stats.ts_end - stats.ts_start;
      const speed = stats.records / stats.time;

      console.log("Time\t", stats.time.toLocaleString(), "s");
      console.log("Rows\t", stats.records.toLocaleString(), "records");
      console.log("Speed\t", speed.toLocaleString(), "rows per sec");
    } else {
      console.log("No rows inserted");
    }
    console.log("-------- Results ---------");

    process.send(stats);
    process.exit();
  }

  async function insert() {
    const argsBufferNo = stats.inserts % options.concurrentRequests;
    const body = {
      stmt: STATEMENT.insert,
      bulk_args: argsBuffer[argsBufferNo],
    };
    try {
      await request(body);
    } catch (err) {
      logError(err);
    } finally {
      stats.inserts_done += 1;
      if (stats.inserts_done === stats.inserts_max) {
        finish();
      } else {
        addInsert();
      }
    }
  }

  setup();
}
