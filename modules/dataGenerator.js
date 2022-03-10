function getCPUObject() {
  const time = Date.now() + randomInt(-5, 15);

  const obj = {
    tags: {
      hostname: randomString("host_", 0, 4000),
      rack: randomString("", 0, 99),
      service_environment: randomStringFromArray([
        "test",
        "staging",
        "production",
      ]),
      os: randomStringFromArray([
        "Ubuntu16.10",
        "Ubuntu16.04LTS",
        "Ubuntu15.10",
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
        "ap-northeast-1a",
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
        "ap-northeast-1",
      ]),
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
    usage_guest_nice: randomInt(0, 99),
  };
  return obj;
}

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min));
}

function randomString(base, min, max) {
  return base + (min + Math.floor(Math.random() * (max - min)));
}

function randomStringFromArray(array) {
  return array[randomInt(0, array.length)];
}

function getCPUObjectBulkArray(num) {
  const objs = new Array(num).fill({});
  return objs.map(() => Object.values(getCPUObject()));
}

module.exports = {
  getCPUObject,
  getCPUObjectBulkArray,
};
