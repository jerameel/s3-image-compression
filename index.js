console.log("Starting...");

require("dotenv").config();
const S3 = require("aws-sdk/clients/s3");
const fs = require("fs");
const sharp = require("sharp");

const s3 = new S3({
  signatureVersion: "v4",
  region: process.env.S3_REGION,
  // uploadsBucket: process.env.S3_UPLOADS_BUCKET,
  accessKeyId: process.env.S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  signedUrlExpiry: Number(process.env.S3_URL_EXPIRY) || 60,
});

const params = {
  Bucket: process.env.S3_UPLOADS_BUCKET,
  Prefix: process.env.S3_PREFIX || '',
};

const main = async () => {
  const data = await new Promise((resolve, reject) => {
    s3.listObjectsV2(params, function (error, data) {
      if (error) {
        reject(error.message);
      } else {
        resolve(data);
      }
    });
  });

  console.log(`${data.Contents.length} files found`);

  // filter by extension
  const images = data.Contents.filter(({ Key }) => {
    const extension = Key.substr(Key.lastIndexOf("."));
    return (
      extension === ".jpg" || extension === ".jpeg" || extension === ".png"
    );
  });

  console.log(`${images.length} images found`);

  // get existing images with mobile versions
  const mobileImages = images
    .filter(({ Key }) => {
      return Key.includes("-mobile.");
    })
    .map(({ Key }) => Key.replace("-mobile.", "."));

  console.log(
    `${mobileImages.length} images with existing mobile versions found`
  );

  // filter by existing mobile versions
  const targetImages = images.filter(({ Key }) => {
    return !Key.includes("-mobile.") && !mobileImages.includes(Key);
  });

  console.log(`${targetImages.length} images for processing found`);

  if (targetImages.length === 0) {
    return;
  }

  const downloadFileFromS3 = async (key) => {
    const path = "./raw/" + key; // Note: make sure that the dir exists
    if (fs.existsSync(path)) {
      console.log(`Skipping ${key}`);
      return Promise.resolve();
    } else {
      console.log(`Downloading ${key}`);
      const file = fs.createWriteStream(path);
      return new Promise((resolve, reject) => {
        const pipe = s3
          .getObject({
            Bucket: params.Bucket,
            Key: key,
          })
          .createReadStream()
          .pipe(file);
        pipe.on("error", reject);
        pipe.on("close", resolve);
      });
    }
  };

  console.log("Downloading...");
  await Promise.all(targetImages.map(({ Key }) => downloadFileFromS3(Key)));
  console.log("Download complete!");

  const compressImage = async (key) => {
    console.log(`Compressing ${key}`);
    const input = "./raw/" + key;
    const output = "./out/" + key; // Note: make sure that the dir exists
    try {
      const sharpImage = await sharp(input);
      const metadata = await sharpImage.metadata();
      console.log(metadata);
      const resizedImage = await (metadata.width > 800
        ? sharpImage.resize({ width: 800 })
        : sharpImage);
      const compressedImage = await (metadata.format === "jpeg" ||
      metadata.format === "jpg"
        ? resizedImage.jpeg({ quality: 70 })
        : resizedImage.png({ compressionLevel: 7 }));

      await compressedImage.toFile(output);
      return Promise.resolve(key);
    } catch {
      console.log(`Warning: Failed to compress ${key}`);
      return Promise.resolve(null);
    }
  };

  console.log("Generating optimized images...");
  const compressedImages = await Promise.all(targetImages.map(({ Key }) => compressImage(Key)));
  console.log(
    `Successfully optimized ${
      compressedImages.filter((a) => a).length
    } images!`
  );


  const uploadFileToS3 = async (key) => {
    const modifiedKey = `${key.substr(
      0,
      key.lastIndexOf(".")
    )}-mobile${key.substr(key.lastIndexOf("."))}`;
    const path = "./out/" + key;
    if (fs.existsSync(path)) {
      console.log(`Uploading ${modifiedKey}`);
      const file = fs.createReadStream(path);
      return new Promise((resolve, reject) => {
        s3.upload(
          {
            Bucket: params.Bucket,
            Key: modifiedKey,
            Body: file,
            ContentEncoding: "base64",
          },
          (error, data) => {
            if (error) {
              reject(error.message);
            } else {
              resolve(data);
            }
          }
        );
      });
    } else {
      console.log(`Warning: Missing optimized image ${path}`);
      return Promise.resolve(null);
    }
  };

  console.log("Uploading optimized images...");
  const uploadedImages = await Promise.all(
    targetImages.map(({ Key }) => uploadFileToS3(Key))
  );
  console.log(
    `Successfully uploaded ${
      uploadedImages.filter((a) => a && a.Location).length
    } images!`
  );
};

main()
  .then(() => {
    console.log("Done!");
  })
  .catch((e) => {
    console.error(e);
  });
