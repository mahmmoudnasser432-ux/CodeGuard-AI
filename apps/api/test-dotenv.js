import "dotenv/config";
console.log("SQLSERVER_PORT from process.env:", process.env.SQLSERVER_PORT);
console.log("SQLSERVER_PORT from process.env (as number):", Number(process.env.SQLSERVER_PORT));