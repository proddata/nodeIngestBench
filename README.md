# Node.js CrateDB Benchmark

A multi-process Node.js script to run high-performance benchmarks on CrateDB clusters.
It supports two scenarios:

1. **Ingestion**: Generation of random data and running batched insert statements against a single table using CrateDB's [HTTP endpoint](https://crate.io/docs/crate/reference/en/latest/interfaces/http.html).

   Please see our [blog post](https://crate.io/blog/how-we-scaled-ingestion-to-one-million-rows-per-second) for a detailed example.
2. **Analytical queries**: On a given data model, a weighted multi-query analytical workload can be run.

## Setup

1. Install Node.js using one of the available [installation methods](https://nodejs.org/en/download/current/)
2. Clone this repository: `git clone https://github.com/proddata/nodeIngestBench.git`
3. Change into the cloned repository: `cd nodeIngestBench`
4. Install dependencies: `npm install`
5. Configure the connection to your CrateDB cluster by creating a `.env` file:

   ```bash
   CRATE_HOST=localhost
   CRATE_USER=admin
   CRATE_PASSWORD=secret-password
   CRATE_PORT=4200
   CRATE_SSL=true
   ```

## Running benchmarks

### Ingestion

Start the benchmarking with `node appClusterIngest.js`. The script takes several optional command-line parameters:

* `table`: The name of the table used for benchmarking. The table will automatically be created if it doesn't exist yet.
* `shards`: The number of shards that will be allocated for the table.
* `replicas`: The number or range of replicas to use for the table.
* `extra_tags_length`: The number of extra values added to the `tags` object in the table. This can be used to generate a wider table with more columns.
* `drop_table`: If `true`, the table will be dropped and re-created when running the script.
* `batch_size`: The number of rows that are inserted as part of a single `INSERT` statement.
* `processes`: The number of child processes that will be spawned. Each child process inserts data independently.
* `concurrent_requests`: Each child process will run this number of concurrent queries.
* `max_rows`: The number of rows after which a child process will terminate. Overall, the (maximum) number of rows that will be inserted is `processes * max_rows`.

#### Example

Below is a basic example that was run on a three-node CrateDB cluster with 10 vCPUs each:

```bash
$ node appClusterIngest.js --batch_size 20000 \
                           --max_rows 1000000 \
                           --shards 12 \
                           --concurrent_requests 20 \
                           --processes 1

-------- Options ---------
{
  dropTable: true,
  processes: 1,
  batchSize: 20000,
  maxRows: 6000000,
  table: 'doc.cpu',
  shards: 6,
  concurrentRequests: 20,
  extraTagsLength: 0,
  replicas: 0
}
--------------------------
[...]
-------- Global Results ---------
Time	 25.179 s
Rows	 6,020,000 records
Speed	239,088.13 rows per sec
---------------------------------
```

As each row contains ten numeric metrics, this is equal to a throughput of 2,400,000 metrics/s.

### Analytical Queries

* `processes`: The number of child processes that will be spawned. Each child process sends queries independently.
* `concurrent_requests`: Each child process will run this number of concurrent queries.
* `max_queries`: The number of queries after which a child process will terminate. Overall, the maximum number of queries is `processes * max_queries`.
* `queries_config`: The path to a YAML file describing the query to run. The file contains a list of queries with a ratio:

  ```yaml
  ---
    - query: |
        SELECT 1
        ORDER BY 1
      ratio: 1
  ```

  When providing multiple queries, the sum of all ratios need to be one.

#### Example

The following `queries.yml` defines a mixed workload of two queries. With ten concurrent queries, the tool will run on average four instances of the first query, and 6 instances of the second query at a time. It will stop when 500 queries have run in total.

```yaml
---
  - query: |
      SELECT 1
      ORDER BY 1
    ratio: 0.4
  - query: |
      SELECT 2
      ORDER BY 1
    ration: 0.6
```

With the query configuration in place, we start the actual benchmark:

```bash
$ node appClusterAnalytical.js --max_queries 500 \
                               --concurrent_queries 10 \
                               --processes 1 \
                               --queries_config queries.yml

----------- Options -------------
{
  processes: 1,
  maxQueries: 500,
  concurrentRequests: 20,
  queries: [
    { query: 'SELECT 1\nORDER BY 1\n', ratio: 0.4 },
    { query: 'SELECT 2\nORDER BY 1\n', ratio: 0.6 }
  ]
}
---------------------------------

[...]

-------- Global Results ---------
Time	 0.441 s
Queries	 500 queries
Speed	 1,133.787 queries per sec
---------------------------------
```
