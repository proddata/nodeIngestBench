const HttpClient = require("./httpClient");

class QueryWorker {
  constructor() {
    const env = JSON.parse(process.env.FORK_ENV);
    this.crateConfig = env.crateConfig;
    this.options = env.options;

    // CrateDB HTTP setup
    this.httpclient = new HttpClient(
      env.crateConfig.host,
      env.crateConfig.port,
      env.crateConfig.ssl,
      env.crateConfig.user,
      env.crateConfig.password,
    );

    this.stats = {
      queries_started: 0,
      queries_done: 0,
      queries_max: env.options.maxQueries,
      ts_start: -1,
      ts_end: -1,
    };
  }

  async request(body) {
    return this.httpclient.query(body);
  }

  async query() {
    await this.request(this.options.query);

    this.stats.queries_done += 1;
    if (this.stats.queries_done === this.stats.queries_max) {
      this.finish();
    } else {
      this.addQuery();
    }
  }

  async addQuery() {
    if (this.stats.queries_started < this.stats.queries_max) {
      if (this.stats.queries_started - this.stats.queries_done < this.options.concurrentRequests) {
        this.stats.queries_started += 1;
        this.query();
        this.addQuery();
      }
    }
  }

  async setup() {
    this.stats.ts_start = Date.now() / 1000;
    this.addQuery();
  }

  async finish() {
    this.stats.ts_end = Date.now() / 1000;

    console.log("-------- Results ---------");
    if (this.stats.queries_done > 0) {
      this.stats.time = this.stats.ts_end - this.stats.ts_start;
      const speed = this.stats.queries_done / this.stats.time;

      console.log("Time\t", this.stats.time.toLocaleString(), "s");
      console.log("Queries\t", this.stats.queries_done.toLocaleString(), "queries");
      console.log("Speed\t", speed.toLocaleString(), "queries per sec");
    } else {
      console.log("No queries ran");
    }
    console.log("-------- Results ---------");

    process.send(this.stats);
    process.exit();
  }
}

module.exports = QueryWorker;
