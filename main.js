require("dotenv").config();
const { Pool } = require("pg");

const args = process.argv.slice(2);

const crateConfig = {
    user: process.env.CRATE_USER || "crate",
    host: process.env.CRATE_HOST || "localhost",
    database: process.env.CRATE_DB || "doc",
    password: process.env.CRATE_PASSWORD|| "",
    port: process.env.CRATE_PORT || 5432,
    ssl: process.env.CRATE_SSL === undefined ? false : process.env.CRATE_SSL.toLowerCase() == 'true',
    max: 24
};

const testOptions = {
  batchsize: Number(args[0]) || 10000,
  max_rows: Number(args[1]) || 1*1000*1000,
  table: "ge.time_series_data",
  columns: "(tag_name, ts, value_float,value_int, attributes, tenant_id)"
};

console.log("-------- Options ---------");
console.log(testOptions);
console.log("--------------------------");

const pool = new Pool(crateConfig)


let ts_start;
let ts_end;
let inserts_started = 0;
let inserts_done = 0;
let max = Math.ceil(testOptions.max_rows / testOptions.batchsize);
let done = false;
let start = 0;
let end = 0;

// Get inital count(*) from table
pool.query(`REFRESH TABLE ${testOptions.table}; SELECT COUNT(*) as count FROM ${testOptions.table}`).then( res => {
    
    start = Number(res[1].rows[0].count);
    ts_start = Date.now() / 1000;

    console.log("Start\t",start.toLocaleString(),"records");
    
    query();
}).catch(err => console.log(err));

function query(){
    if(inserts_started <= max){
        inserts_started++;
        pool.query(getInsertQuery()).then(raise).catch(err => console.log(err));

        let timeout = 20;
        setTimeout(query,timeout);
    }
}

function raise(){
    inserts_done++;
    if(!done && inserts_done == max){
        done = true;
        pool.query(`REFRESH TABLE ${testOptions.table}; SELECT COUNT(*) as count FROM ${testOptions.table}`).then( res => {
            
            end = Number(res[1].rows[0].count);
            let rows = end-start;
            ts_end = Date.now() / 1000;
            let rate = rows/(ts_end-ts_start);

            console.log("End\t",end.toLocaleString(),"records");
            console.log("New\t",rows.toLocaleString(),"records");
            console.log("Time\t",(ts_end-ts_start).toLocaleString(),'s');
            console.log("Speed\t",rate.toLocaleString(),'rows per sec');

            pool.end();
        }).catch(err => console.log(err));
        
    }
}

function getInsertQuery() {
    let query = `INSERT INTO ${testOptions.table} ${testOptions.columns} VALUES `;
    for (let i = 0; i < testOptions.batchsize; i++) {
        let s = getRandomObject();
        if (i > 0) query += `,`;
        query += `('${s.tag_name}',${s.ts},${s.measurement},${s.value_int},'${s.attributes}',${s.tenant_id})`;
    }
    query += ';';
    //console.log(query);
    return query
}

function getRandomObject(){
    let obj = {
        tag_name : randomString("tag",1,200),
        ts: randomInt(1621814400000,1625443200000-1),
        value_int : randomInt(1,Number.MAX_SAFE_INTEGER-1),
        measurement : randomFloat(1.0,Number.MAX_VALUE-1),
        quality : randomInt(1,3),
        attributes : `{"${randomString("tag",1,20)}":"${randomString("value",100,10000)}","${randomString("tag",21,40)}":"${randomString("value",100,10000)}"}`,
        tenant_id : randomInt(10000,1000000)
    }

    return obj;
}


function randomInt(min, max) {
    return min + Math.floor(Math.random() * (max - min));
}

function randomFloat(min, max) {
    return min + Math.random() * (max - min);
}

function randomString(base, min, max) {
    return base + min + Math.floor(Math.random() * (max - min));
}