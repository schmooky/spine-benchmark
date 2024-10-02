const fs = require("fs").promises;
const path = require("path");
const data = require("./all.json");


async function createFilesFromJson() {
  try {
    Object.keys(data).forEach(async (fileName) => {

      // Write the content to the file
      await fs.writeFile(`./${fileName}`, JSON.stringify(data[fileName]));

      console.log(`Created file: ${fileName}`);
    });
    console.log("All files have been created successfully.");
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

const outputDirectory = ".";

createFilesFromJson();
