require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const adminRoutes = require("./routes/adminRoutes");
const productRoutes = require("./routes/productsRoutes");
const customerRoutes = require("./routes/customerRoutes");

const app = express();

app.use(cookieParser());

const clientOrigin = "http://localhost:5173";

app.use(
  cors({
    origin: clientOrigin,
    credentials: true,
  })
);

app.use(express.json());

app.use("/api/admin", adminRoutes);

app.use("/api/customer", customerRoutes);

app.use("/api/products", productRoutes);

const PORT = process.env.PORT;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
