require("dotenv").config();
const { Pool } = require("pg");
const core = require("./modules/core.js");

const args = process.argv.slice(2);

const crateConfig = {
  user: process.env.CRATE_USER || "crate",
  host: process.env.CRATE_HOST || "localhost",
  database: process.env.CRATE_DB || "doc",
  password: process.env.CRATE_PASSWORD || "",
  port: process.env.CRATE_PORT || 5432,
  ssl:
    process.env.CRATE_SSL === undefined
      ? false
      : process.env.CRATE_SSL.toLowerCase() == "true",
  max: 24
};

const testOptions = {
  batchsize: Number(args[0]) || 20000,
  max_rows: Number(args[1]) || 1 * 1000 * 1000,
  table: "georg.cpu",
  columns:
    "(tags, ts, usage_user, usage_system, usage_idle, usage_nice, usage_iowait, usage_irq, usage_softirq, usage_steal, usage_guest, usage_guest_nice)"
};

console.log("-------- Options ---------");
console.log(testOptions);
console.log("--------------------------");

const pool = new Pool(crateConfig);

let activeQueries = 0;

let ts_start;
let ts_end;
let inserts_started = 0;
let inserts_done = 0;
let max = Math.ceil(testOptions.max_rows / testOptions.batchsize);
let done = false;
let start = 0;
let end = 0;

startBenchmark();

function startBenchmark() {
  pool
    .query(
      `REFRESH TABLE ${testOptions.table}; SELECT COUNT(*) as count FROM ${testOptions.table}`
    )
    .then(res => {
      start = Number(res[1].rows[0].count);
      ts_start = Date.now() / 1000;

      console.log("Start\t", start.toLocaleString(), "records");

      addQuery();
    })
    .catch(err => console.log(err));
}

function addQuery() {
  if (inserts_started <= max) {
    if (activeQueries <= crateConfig.max) {
      inserts_started++;
      pool
        .query(getInsertQuery())
        .then(raise)
        .catch(err => console.log(err));
      addQuery();
    } else {
      setTimeout(addQuery, 20);
    }
  }
}

function raise() {
  inserts_done++;
  activeQueries--;
  if (!done && inserts_done == max) {
    console.log("inserts done");
    done = true;
    ts_end = Date.now() / 1000;
    pool
      .query(
        `REFRESH TABLE ${testOptions.table}; SELECT COUNT(*) as count FROM ${testOptions.table}`
      )
      .then(res => {
        end = Number(res[1].rows[0].count);
        let rows = end - start;
        let rate = rows / (ts_end - ts_start);

        console.log("End\t", end.toLocaleString(), "records");
        console.log("New\t", rows.toLocaleString(), "records");
        console.log("Time\t", (ts_end - ts_start).toLocaleString(), "s");
        console.log("Speed\t", rate.toLocaleString(), "rows per sec");

        pool.end();
      })
      .catch(err => console.log(err));
  }
}

function getInsertQuery() {
  activeQueries++;

  let objs = new Array(testOptions.batchsize);
  for (let i = 0; i < testOptions.batchsize; i++) {
      objs[i] = getCPUObject();
  }

  let query = core.getMultipleInsertStatements(objs,testOptions.table);

  return query;
}

let time = Date.now();

function getCPUObject() {
  time += randomInt(-5, 15);

  let obj = {
    tags: {
      hostname: randomString("host_", 0, 4000),
      rack: randomString("", 0, 99),
      service_environment: randomStringFromArray([
        "test",
        "staging",
        "production"
      ]),
      os: randomStringFromArray([
        "Ubuntu16.10",
        "Ubuntu16.04LTS",
        "Ubuntu15.10"
      ]),
      service: randomString("", 0, 19),
      datacenter: randomStringFromArray([
        "us-west-2c",
        "us-west-2b",
        "us-west-2a",
        "us-west-1b",
        "us-west-1a",
        "us-east-1e",
        "us-east-1c",
        "us-east-1b",
        "us-east-1a",
        "sa-east-1c",
        "sa-east-1b",
        "sa-east-1a",
        "eu-west-1c",
        "eu-west-1b",
        "eu-west-1a",
        "eu-central-1b",
        "eu-central-1a",
        "ap-southeast-2b",
        "ap-southeast-2a",
        "ap-southeast-1b",
        "ap-southeast-1a",
        "ap-northeast-1c",
        "ap-northeast-1a"
      ]),
      arch: randomStringFromArray(["x86", "x64"]),
      team: randomStringFromArray(["SF", "NYC", "LON", "CHI"]),
      service_version: randomString("", 0, 1),
      region: randomStringFromArray([
        "us-west-2",
        "us-west-1",
        "us-east-1",
        "sa-east-1",
        "eu-west-1",
        "eu-central-1",
        "ap-southeast-2",
        "ap-southeast-1",
        "ap-northeast-1"
      ])
    },
    ts: time,
    usage_user: randomInt(0, 99),
    usage_system: randomInt(0, 99),
    usage_idle: randomInt(0, 99),
    usage_nice: randomInt(0, 99),
    usage_iowait: randomInt(0, 99),
    usage_irq: randomInt(0, 99),
    usage_softirq: randomInt(0, 99),
    usage_steal: randomInt(0, 99),
    usage_guest: randomInt(0, 99),
    usage_guest_nice: randomInt(0, 99)
  };
  return obj;
}

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min));
}

function randomFloat(min, max) {
  return min + Math.random() * (max - min);
}

function randomString(base, min, max) {
  return base + (min + Math.floor(Math.random() * (max - min)));
}

function randomStringFromArray(array) {
  return array[randomInt(0, array.length)];
}
