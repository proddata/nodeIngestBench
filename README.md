# NodeIngestBench

a simple nodejs script to quickly test ingest performance on CrateDB clusters.

top measured performance with single nodejs client : 1 200 000 rows / s

## new improved version (app.js)

Ubuntu 

```sh
apt update && apt upgrade
curl -sL https://deb.nodesource.com/setup_14.x | sudo -E bash -
apt update
sudo apt-get install -y nodejs
npm install
node app.js --batchsize 20000 --max_rows 1000000 --table "doc.benchmark" --shards 12 --concurrent_request 20
```


```env
CRATE_HOST=localhost
CRATE_USER=admin
CRATE_PASSWORD=secret-password
CRATE_DB=doc
CRATE_PORT=4200
CRATE_SSL=true
```


## example run with app.js

3 nodes (10 vCPUs) CrateDB cluster

```bash
node app.js --batchsize 20000 --max_rows 1000000 --table "doc.benchmark" --shards 12 --concurrent_request 20
-------- Options ---------
{
  dropTable: true,
  batchsize: 20000,
  max_rows: 6000000,
  table: 'doc.benchmark',
  shards: 6,
  concurrent_requests: 20
}
--------------------------
... Buffer updated
-------- Results ---------
Time	 25.179 s
Rows	 6,020,000 records
Speed	 239,088.13 rows per sec
-------- Results ---------
```

=> 2,400,000 Metrics / sec

