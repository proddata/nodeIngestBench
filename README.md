# NodeIngestBench

a very simple node.js script to quickly test ingest performance on large CrateDB 
clusters.

top measured performance with single node.js client : 1 200 000 rows / s

```sh
apt update && apt upgrade
curl -sL https://deb.nodesource.com/setup_14.x | sudo -E bash -
apt update
sudo apt-get install -y nodejs
npm install
node app.js --batchsize 20000 --max_rows 1000000 --table "doc.benchmark" --shards 12 --concurrent_request 20
```
