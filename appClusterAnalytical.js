require("dotenv").config();
const cluster = require("cluster");

const fs = require("fs");
const argv = require("minimist")(process.argv.slice(2));
const yaml = require('js-yaml');

const QueryWorker = require("./modules/queryWorker");

let crateConfig; let options; let activeProcesses;
const statsGlobal = {
  queriesDone: 0,
  tsStart: Number.MAX_VALUE,
  tsEnd: Number.MIN_VALUE,
};

function messageHandler(msg) {
  statsGlobal.queriesDone += msg.queriesDone;
  statsGlobal.tsStart = Math.min(statsGlobal.tsStart, msg.tsStart);
  statsGlobal.tsEnd = Math.max(statsGlobal.tsEnd, msg.tsEnd);
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
  console.log("\n--------------- Global Results ----------------");
  if (statsGlobal.queriesDone > 0) {
    statsGlobal.time = statsGlobal.tsEnd - statsGlobal.tsStart;
    statsGlobal.speed = statsGlobal.queriesDone / statsGlobal.time;
    statsGlobal.avgRuntime = statsGlobal.time / statsGlobal.queriesDone;

    console.log("Time\t\t\t", statsGlobal.time.toLocaleString(), "s");
    console.log("Queries\t\t\t", statsGlobal.queriesDone.toLocaleString(), "queries");
    console.log("Speed\t\t\t", statsGlobal.speed.toLocaleString(), "queries per sec");
    console.log("Avg. runtime per query\t", statsGlobal.avgRuntime.toLocaleString(), "sec");
  } else {
    console.log("No queries ran");
  }
  console.log("-----------------------------------------------\n");
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
