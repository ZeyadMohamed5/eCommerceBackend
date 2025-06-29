const multer = require("multer");

const storage = multer.memoryStorage(); // Keep files in memory buffer

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, 
  },
});

module.exports = upload;
