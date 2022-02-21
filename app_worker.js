const { parentPort } = require("worker_threads");
const dataGenerator = require("./modules/dataGenerator");

// You can do any heavy stuff here, in a synchronous way
// without blocking the "main thread"

parentPort.on("message", createData);

function createData(message) {
  if (message.exit) {
    // clean up
    console.log("doing cleanup");
    process.exit(0);
  } else {
    parentPort.postMessage({ args_buffer: getNewBufferSync(message)});
  }
}


function getNewBufferSync(options){
  return new Array(options.concurrent_requests)
  .fill(dataGenerator.getCPUObjectBulkArray(options.batchsize));
}