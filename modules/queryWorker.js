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
      queriesStarted: 0,
      queriesDone: 0,
      queriesMax: env.options.maxQueries,
      queriesRuntime: 0,
      tsStart: -1,
      tsEnd: -1,
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

  request(body) {
    return this.httpclient.query(body);
  }

  async query() {
    const response = await this.request(this.randomQuery());
    this.stats.queriesRuntime += response.data.duration;

    this.stats.queriesDone += 1;
    if (this.stats.queriesDone === this.stats.queriesMax) {
      this.finish();
    } else {
      this.addQuery();
    }
  }

  async addQuery() {
    if (this.stats.queriesStarted < this.stats.queriesMax) {
      if (this.stats.queriesStarted - this.stats.queriesDone < this.options.concurrentRequests) {
        this.stats.queriesStarted += 1;
        this.query();
        this.addQuery();
      }
    }
  }

  async setup() {
    this.stats.tsStart = Date.now() / 1000;
    this.addQuery();
  }

  async finish() {
    this.stats.tsEnd = Date.now() / 1000;

    console.log("--------------- Results ----------------");
    if (this.stats.queriesDone > 0) {
      this.stats.time = this.stats.tsEnd - this.stats.tsStart;
      const speed = this.stats.queriesDone / this.stats.time;
      const avgRuntime = this.stats.queriesRuntime / this.stats.queriesDone / 1000;

      console.log("Time\t\t", this.stats.time.toLocaleString(), "s");
      console.log("Queries\t\t", this.stats.queriesDone.toLocaleString(), "queries");
      console.log("Speed\t\t", speed.toLocaleString(), "queries per sec");
      console.log("Avg. runtime\t", avgRuntime.toLocaleString(), "sec");
    } else {
      console.log("No queries ran");
    }
    console.log("--------------- Results ----------------");

    process.send(this.stats);
    process.exit();
  }
}

module.exports = QueryWorker;
