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

    this.queryDistribution = null;
  }

  randomQuery() {
    if (this.queryDistribution === null) {
      this.queryDistribution = [];

      /*
       * Create an array with a cardinality of 100.
       * The elements are query IDs, where the frequency of each ID matches the distribution.
       * E.g. with query1: 0.4 and query2: 0.6, the array will have 40 times the ID of query1,
       * and 60 times the ID of query2.
       */
      for (let i = 0; i < this.options.queries.length; i += 1) {
        const weight = this.options.queries[i].proportion * 100;
        for (let j = 0; j < weight; j += 1) {
          this.queryDistribution.push(i);
        }
      }
    }

    return this.options.queries[Math.floor(Math.random() * this.options.queries.length)]
      .query.trimEnd();
  }

  async request(body) {
    return this.httpclient.query(body);
  }

  async query() {
    await this.request(this.randomQuery());

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
