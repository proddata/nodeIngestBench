require("dotenv").config();
const cluster = require("cluster");

const fs = require("fs");
const argv = require("minimist")(process.argv.slice(2));
const yaml = require('js-yaml');

const QueryWorker = require("./modules/queryWorker");

let crateConfig; let options; let activeProcesses;
const statsGlobal = {
  queries_done: 0,
  ts_start: Number.MAX_VALUE,
  ts_end: Number.MIN_VALUE,
};

function messageHandler(msg) {
  statsGlobal.queries_done += msg.queries_done;
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
  if (statsGlobal.queries_done > 0) {
    statsGlobal.time = statsGlobal.ts_end - statsGlobal.ts_start;
    statsGlobal.speed = statsGlobal.queries_done / statsGlobal.time;

    console.log("Time\t", statsGlobal.time.toLocaleString(), "s");
    console.log("Queries\t", statsGlobal.queries_done.toLocaleString(), "queries");
    console.log("Speed\t", statsGlobal.speed.toLocaleString(), "queries per sec");
  } else {
    console.log("No queries ran");
  }
  console.log("---------------------------------\n");
}

// Master
if (cluster.isMaster) {
  console.log("CrateDB Query Bench Master started");

  crateConfig = {
    user: process.env.CRATE_USER || "crate",
    host: process.env.CRATE_HOST || "localhost",
    password: process.env.CRATE_PASSWORD || "",
    port: process.env.CRATE_PORT || 4200,
    ssl: process.env.CRATE_SSL === "true" || false,
  };

  options = {
    processes: Number(argv.processes) || 1,
    maxQueries: Number(argv.max_queries) || 100,
    concurrentRequests: Number(argv.concurrent_requests) || 20,
    queries: yaml.load(fs.readFileSync(argv.queries_config, 'utf8')),
  };

  const ratiosSum = options.queries.reduce((total, query) => total + query.ratio, 0);
  if (ratiosSum !== 1) {
    throw new Error(`Query ratios do not sum up to one (was: ${ratiosSum})`);
  }

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

// Worker
if (cluster.isWorker) {
  const worker = new QueryWorker();
  worker.setup();
}
