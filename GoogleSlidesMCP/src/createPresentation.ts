import { google, slides_v1 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { authenticate } from "@google-cloud/local-auth";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { CompanyData, AddSlideParam } from "./types.js";
import { existsSync } from "fs";
import { string } from "zod/v4";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCOPES = ["https://www.googleapis.com/auth/presentations"];
const CREDENTIALS_PATH = path.join(__dirname, "../credentials.json");
const TOKEN_PATH = path.join(__dirname, "../token.json");

//Holds the presentationId of the most recently created presentation
//const globalId = '';

/* ----———————————————————————————————————————————————--- */
/**
 * Code taken from Google's Node.js quickstart tutorial
 * on 'developers.google.com'. Creates and configures necessary tokens
 * and data to use the Google Slides API.
 */

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH, "utf-8");
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials) as any;
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file compatible with GoogleAuth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client: OAuth2Client) {
  const content = await fs.readFile(CREDENTIALS_PATH, "utf-8");
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: "authorized_user",
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

/**
 * Creates a Google Slide presentation and edits the 'Title' slide to
 * contain the company name and date the presentation was created.
 * @param {string} companyName The name of the company.
 * @param {slides_v1.Slides} service The Google Slides API instance.
 * @returns A presentationId string.
 */
async function createPresentation(
  companyData: CompanyData,
  service: slides_v1.Slides
) {
  //Creates the presentation and adds the Company name and current date into the title
  try {
    const presentation = await service.presentations.create({
      requestBody: {
        title: `${companyData.companyName} Slide Deck`,
      },
    });

    //Gets the presentationId
    const presentationId = presentation.data.presentationId;
    if (!presentationId) {
      throw new Error("presentationId is null or undefined");
    }

    //Get the list of slides in our presentation
    const slideData = await service.presentations.get({
      presentationId,
    });

    //Get a reference to the first slide
    const firstSlide = slideData.data.slides?.[0];
    if (!firstSlide) {
      throw new Error("No slides found");
    }
    if (!firstSlide.pageElements || firstSlide.pageElements.length === 0) {
      throw new Error("No elements found on First Slide");
    }

    //Get the objectIDs of the two automatically generated textboxes.
    const titleId = firstSlide.pageElements[0].objectId;
    const subtitleId = firstSlide.pageElements[1].objectId;
    if (!subtitleId || !titleId) {
      throw new Error("titleID or subtitleId not set");
    }

    //Replace the text inside each textbox with the company name and subheader respectively
    await service.presentations.batchUpdate({
      presentationId,
      requestBody: {
        requests: [
          {
            insertText: {
              objectId: titleId,
              text: companyData.companyName,
              insertionIndex: 0,
            },
          },
          {
            insertText: {
              objectId: subtitleId,
              text: `${companyData.location}\nCreated: ${
                new Date().toISOString().split("T")[0]
              }`,
              insertionIndex: 0,
            },
          },
        ],
      },
    });

    return presentationId;
  } catch (err) {
    throw new Error("Failed to create presentation in createPresentation()");
  }
}

/**
 * Creates a new slide with a title and bullet points for key metrics.
 * Bullet point content is set depending on 'slideData' parameter.
 * @param {AddSlideParam} slideData Contains relvant data/metrics for this slide
 * @param {slides_v1.Slides} service The Google Slides API instance.
 */
async function addNewBulletSlide(
  slideData: AddSlideParam,
  service: slides_v1.Slides
) {
  if (!slideData.presentationId) {
    throw new Error(
      "Could not get presentationID in addGeneralSummary(). Check your parameter in function call."
    );
  }

  const slideType = slideData.slideType.kind;

  //Formats string that will be put into the body of this slide.
  let summary = "";
  let keyString = "";
  let valueString = "";
  for (const [key, value] of Object.entries(slideData.slideType)) {
    keyString = key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase());

    if (key == "kind") {
      continue;
    }

    summary += `${keyString}: ${value}\n`;
  }

  //Adds a new slide in our presentation
  const newSlide = await service.presentations.batchUpdate({
    presentationId: slideData.presentationId,
    requestBody: {
      requests: [
        {
          createSlide: {
            objectId: slideType,
            slideLayoutReference: {
              predefinedLayout: "TITLE_AND_BODY",
            },
          },
        },
      ],
    },
  });

  //Get a reference to the presentation we created. This is NOT the presentation ID
  const presentation = await service.presentations.get({
    presentationId: slideData.presentationId,
  });

  //Get a reference to the array of slides in the presentation
  const slidesArray = presentation.data.slides;
  if (!slidesArray) {
    throw new Error(
      `Could not retrieve a reference to slides in presentation at this ID: ${slideData.presentationId}`
    );
  }

  //Get a reference to the 'General Summary' slide
  const currentSlide = slidesArray.find(
    (slide) => slide.objectId === slideType
  );
  if (
    !currentSlide ||
    !currentSlide.pageElements ||
    currentSlide.pageElements.length === 0
  ) {
    throw new Error("'General Summary' slide not found.");
  }

  //There are automatically two textbox elements in this layout.
  //Get the ID's of those SHAPES.
  const titleId = currentSlide.pageElements[0].objectId;
  const bodyId = currentSlide.pageElements[1].objectId;
  if (!bodyId || !titleId) {
    throw new Error("titleID or subtitleId not set");
  }

  //Add text to the slide and style them.
  const updateRes = await service.presentations.batchUpdate({
    presentationId: slideData.presentationId,
    requestBody: {
      requests: [
        {
          insertText: {
            objectId: titleId,
            text: slideType
              .replace(/([A-Z])/g, " $1")
              .replace(/^./, (str) => str.toUpperCase()),
            insertionIndex: 0,
          },
        },
        {
          updateTextStyle: {
            objectId: titleId,
            style: {
              bold: true,
              fontFamily: "Times New Roman",
              fontSize: {
                magnitude: 25,
                unit: "PT",
              },
            },
            textRange: { type: "ALL" },
            fields: "bold,fontFamily,fontSize",
          },
        },
        {
          insertText: {
            objectId: bodyId,
            text: summary,
            insertionIndex: 0,
          },
        },
        {
          createParagraphBullets: {
            objectId: bodyId,
            textRange: {
              type: "ALL",
            },
            bulletPreset: "BULLET_DISC_CIRCLE_SQUARE",
          },
        },
      ],
    },
  });
}

/**
 * Creates a new slide with a title and a paragraph.
 * Paragraph is set depending on 'slideData' parameter
 * @param {AddSlideParam} slideData Contains relvant data/metrics for this slide
 * @param {slides_v1.Slides} service The Google Slides API instance.
 */
async function addNewParagraphSlide(
  slideData: AddSlideParam,
  service: slides_v1.Slides
) {
  if (!slideData.presentationId) {
    throw new Error(
      "Could not get presentationID in addNewParagraphSlide(). Check the parameter in your function call."
    );
  }

  const slideType = slideData.slideType.kind;
  if (slideType !== "Paragraph") {
    throw new Error(
      "addNewParagraph() requires an 'AddSlideParam' of 'kind: 'paragraph'"
    );
  }

  //Format data from parameter into a string
  const summary = slideData.slideType.body;

  //Adds a new slide in our presentation with a unique ID
  const uniqueID = `id_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const newSlide = await service.presentations.batchUpdate({
    presentationId: slideData.presentationId,
    requestBody: {
      requests: [
        {
          createSlide: {
            objectId: uniqueID,
            slideLayoutReference: {
              predefinedLayout: "TITLE_AND_BODY",
            },
          },
        },
      ],
    },
  });

  //Get a reference to the presentation we created. This is NOT the presentation ID
  const presentation = await service.presentations.get({
    presentationId: slideData.presentationId,
  });

  //Get a reference to the array of slides in the presentation
  const slidesArray = presentation.data.slides;
  if (!slidesArray) {
    throw new Error(
      `Could not retrieve a reference to slides in presentation at this ID: ${slideData.presentationId}`
    );
  }

  //Get a reference to the most recently created slide
  const currentSlide = slidesArray[slidesArray.length - 1];
  if (
    !currentSlide ||
    !currentSlide.pageElements ||
    currentSlide.pageElements.length === 0
  ) {
    throw new Error("Latest slide not found or has no elements");
  }

  //There are automatically two textbox elements in this layout.
  //Get the ID's of those SHAPES.
  const titleId = currentSlide.pageElements[0].objectId;
  const bodyId = currentSlide.pageElements[1].objectId;
  if (!bodyId || !titleId) {
    throw new Error("titleID or subtitleId not set");
  }

  //Add text to the slide and style them.
  const updateRes = await service.presentations.batchUpdate({
    presentationId: slideData.presentationId,
    requestBody: {
      requests: [
        {
          insertText: {
            objectId: titleId,
            text: slideType,
            insertionIndex: 0,
          },
        },
        {
          updateTextStyle: {
            objectId: titleId,
            style: {
              bold: true,
              fontFamily: "Times New Roman",
              fontSize: {
                magnitude: 25,
                unit: "PT",
              },
            },
            textRange: { type: "ALL" },
            fields: "bold,fontFamily,fontSize",
          },
        },
        {
          insertText: {
            objectId: bodyId,
            text: summary,
            insertionIndex: 0,
          },
        },
      ],
    },
  });
}

/**
 * Initiates the creation of an entire Pitch Deck.
 * Includes a 'Title' slide and any supplemental slides thereafter.
 * @param {AddSlideParam} companyData The general data of the company.
 */
export async function initiateSlides(companyData: CompanyData) {
  try {
    //Creates an authorization token
    const auth = await authorize();
    const service = google.slides({ version: "v1", auth });

    //Creates a new presentation and updates 'Title' slide
    const newPresentationId = await createPresentation(companyData, service);
    if (!newPresentationId) {
      throw new Error("Failed to create presentation in initiateSlides()");
    }
    companyData.presentationId = newPresentationId;

    //Formats data and creates a 'General Summary' slide
    const generalSummaryShape = {
      companyName: companyData.companyName,
      slideType: {
        kind: "GeneralSummary" as const,
        foundedYear: companyData.foundedYear,
        arr: companyData.arr,
        industry: companyData.industry,
        burnRate: companyData.burnRate,
        exitStrategy: companyData.exitStrategy,
      },
      presentationId: newPresentationId,
    };
    await addNewBulletSlide(generalSummaryShape, service);

    //Formats data and creates a 'Investment Details' slide
    const investmentDetailsShape = {
      companyName: companyData.companyName,
      slideType: {
        kind: "InvestmentDetails" as const,
        dealStatus: companyData.dealStatus,
        fundingStage: companyData.fundingStage,
        investmentAmount: companyData.investmentAmount,
        investmentDate: companyData.investmentDate,
      },
      presentationId: newPresentationId,
    };
    await addNewBulletSlide(investmentDetailsShape, service);

    //Formats data and creates a 'Paragraph' slide
    const paragraphShape = {
      companyName: companyData.companyName,
      slideType: {
        kind: "Paragraph" as const,
        body: companyData.keyMetrics,
      },
      presentationId: newPresentationId,
    };
    await addNewParagraphSlide(paragraphShape, service);

    console.error(`\nCreated presentation with ID: ${newPresentationId}`);
    return newPresentationId;
  } catch (error) {
    throw new Error(`There was an error in initiateSlides(): \n${error}`);
  }
}

/**
 * This function allows the user (or the LLM) to create a custom slide.
 * The LLM will format a 'content' block and place it into the new slide along
 * with a custom title.
 * @param {string} title The title of the custom slide.
 * @param {string} content The content placed inside the slide (formatted by the LLM)
 * @param {string} presentationId The ID of the presentation we want to add a slide to.
 */
export async function addCustomSlide(
  title: string,
  content: string,
  presentationId: string
) {
  try {
    //Creates an authorization token
    const auth = await authorize();
    const service = google.slides({ version: "v1", auth });

    //Formats data and creates a 'Paragraph' slide
    const paragraphShape = {
      companyName: title,
      slideType: {
        kind: "Paragraph" as const,
        body: content,
      },
      presentationId: presentationId,
    };
    await addNewParagraphSlide(paragraphShape, service);
  } catch (error) {
    throw new Error(`There was an error in addCustomSlide(): \n${error}`);
  }
}

//TESTING: Main function used for testing
async function main() {
  try {
    const testData = {
      companyName: "Hax @ Newark",
      location: "Newark NJ",
      foundedYear: 2011,
      arr: 20000000,
      industry: "Venture Capital",
      burnRate: 8000000,
      exitStrategy: "IPO",
      dealStatus: "Due Diligence",
      fundingStage: "Series C",
      investmentAmount: 200,
      investmentDate: "May 10, 2024",
      keyMetrics:
        "This is a really really cool company with really really cool people. Let's see how long I can make this test string to test how Google Slides handles text wrap. My name is Gabe Ramirez, an intern at Hax. I love music (I play guitar and dance), and honestly forgot how much I enjoyed coding and problem solving until this project.",
    };

    await initiateSlides(testData);
  } catch (error) {
    console.error("\nThere was an error in the main function!\n", error);
  }
}

//main();
