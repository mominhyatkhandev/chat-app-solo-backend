const mongoose = require("mongoose");
require("dotenv").config();

const url = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.tl9zb04.mongodb.net/?retryWrites=true&w=majority`;

mongoose
  .connect(url, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Connected to DB"))
  .catch((e) => console.log("Error connecting db", e));
