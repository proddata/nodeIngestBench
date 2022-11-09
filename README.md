# Node.js CrateDB Ingest Benchmark

A multi-process Node.js script to run high-performance ingest benchmarks on CrateDB clusters.
The script generates random data and runs batched insert statements against a single table using CrateDB's [HTTP endpoint](https://crate.io/docs/crate/reference/en/latest/interfaces/http.html).

The top measured performance (single Node.js process, seven-node CrateDB cluster with 30 vCPUs each) was 1,200,000 rows/s.

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

Start the benchmarking with `node appCluster.js`. The script takes several optional command-line parameters:
 * `table`: The name of the table used for benchmarking. The table will automatically be created if it doesn't exist yet.
 * `shards`: The number of shards that will be allocated for the table.
 * `replicas`: The number or range of replicas to use for the table.
 * `extra_tags_length`: The number of extra values added to the `tags` object in the table. This can be used to generate a wider table with more columns.
 * `drop_table`: If `true`, the table will be dropped and re-created when running the script.
 * `batch_size`: The number of rows that are inserted as part of a single `INSERT` statement.
 * `processes`: The number of child processes that will be spawned. Each child process inserts data independently.
 * `concurrent_requests`: Each child process will run this number of concurrent queries.
 * `max_rows`: The number of rows after which a child process will terminate. Overall, the (maximum) number of rows that will be inserted is `processes * max_rows`.

## Example

Below is a basic example that was run on a three-node CrateDB cluster with 10 vCPUs each:

```bash
$ node appCluster.js --batch_size 20000 --max_rows 1000000 --shards 12 --concurrent_requests 20 --processes 1

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
