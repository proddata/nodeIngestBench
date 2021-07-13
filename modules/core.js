/**
 * 
 * This files contains serveral convenience methods to create SQL Statements from JS Objects
 * 
 * @summary Functions to help generate SQL INSERT Queries from JS Objects
 * @author Georg Traar <mail@graar.net>
 * 
 * Created at       : 2020-10-05 20:00:00
 * Last modified    : 2020-08-27 09:53:00
 */

 module.exports.getQuotedArrayOfKeys = getQuotedArrayOfKeys;
 module.exports.getQuotedArrayOfValues = getQuotedArrayOfValues;
 module.exports.getSingleInsertStatement = getSingleInsertStatement;
 module.exports.getUnnestedInsertStatement = getUnnestedInsertStatement;
 module.exports.getMultipleInsertStatements = getMultipleInsertStatements;

 
 function getQuotedArrayOfKeys(obj){
     return Object.keys(obj).map(key => `"${key}"`);
 }
 
 function getQuotedArrayOfValues(obj){
     return Object.values(obj).map(x => {
         if(Array.isArray(x)) return `[${getQuotedArrayOfValues(x)}]`;
         else if(! isNaN(x)) return `${x}`; // also true for null / boolean
         else if(typeof x === 'string') return `'${x.replace(/'/g, '"')}'`;
         else if(typeof x === 'object') return `'${JSON.stringify(x)}'`;
         else return `'${x}'`;
     })
 }
 
 /**
  * Create a simple single SQL INSERT statement from an object
  * @param  {Object} obj Object with properties
  * @param  {string} table Name of the SQL Table to be used
  * @return {string}      Prepared SQL INSERT statement
  */
 function getSingleInsertStatement(obj, table){
     let columns = getQuotedArrayOfKeys(obj);
     let values = getQuotedArrayOfValues(obj);
 
     let stmt = `INSERT INTO ${table} (${columns}) VALUES (${values}) `;
     stmt += `ON CONFLICT DO NOTHING`;
 
     return stmt;
 }
 
 /**
  * Create a simple single SQL INSERT statement from an object
  * @param  {Object} obj Object with propertoes
  * @param  {string} table Name of the SQL Table to be used
  * @return {string}      Prepared SQL INSERT statement
  */
 function getMultipleInsertStatements(objs, table){
     let columns = getQuotedArrayOfKeys(objs[0]);
     let values = [... objs.map(obj => `(${getQuotedArrayOfValues(obj)})`)];
 
     let stmt = `INSERT INTO ${table} (${columns}) VALUES ${values} `;
     stmt += `ON CONFLICT DO NOTHING`;
 
     return stmt;
 }
 
 /**
  * Create a unnested SQL INSERT statement from arrays of Objects
  * @param  {Object} obj Object with propertiees
  * @param  {string} table Name of the SQL Table to be used
  * @return {string}      Prepared SQL INSERT statement
  */
 function getUnnestedInsertStatement(obj, table){
     let columns = getQuotedArrayOfKeys(obj);
     let values = getQuotedArrayOfValues(obj);
 
     let stmt = `INSERT INTO ${table} (${columns}) `
     stmt += `(SELECT ${columns.map((x,i) => (`col${i+1}`))} FROM UNNEST (${values})) `
     stmt += `ON CONFLICT DO NOTHING;`;
     return stmt;
 }
