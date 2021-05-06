# S3 Image Compression
Automatically create resized and compressed versions of your existing S3 images, using **aws-sdk** and using **sharp** for image manipulation.

## Setup
- Create a `.env` file using the provided `.env.template`.
- Create `out` and `raw` directories, and include the necessary subdirectories within it.
- By default this creates a resized and compressed version of your existing images with `"-mobile"` on the filename instead. Feel free to modify it.

## Usage
You need to have npm installed.

```bash
# Install node_modules
npm i

# Start the script
npm run start
```