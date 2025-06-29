const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");

function streamUpload(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream((error, result) => {
      if (result) resolve(result);
      else reject(error);
    });

    streamifier.createReadStream(buffer).pipe(stream);
  });
}

module.exports = streamUpload;
