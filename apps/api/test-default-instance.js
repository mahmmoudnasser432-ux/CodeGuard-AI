import sql from "mssql";

(async () => {
  try {
    const pool = new sql.ConnectionPool({
      server: "localhost",
      database: "master",
      user: "sa",
      password: "YourStrong!Pass123",
      options: {
        encrypt: true,
        trustServerCertificate: true
      }
    });
    await pool.connect();
    console.log("Connected to default instance!");
    await pool.close();
  } catch (err) {
    console.log("Failed to connect to default instance:", err.message);
  }
})();